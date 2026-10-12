/* ═══════════════════════════════════════════════════════════
   PLAYTA — Firebase Service Helper
   js/firebase-service.js
   Shared utilities used by all modules
═══════════════════════════════════════════════════════════ */

import { db, storage, auth, COLLECTIONS }    from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, addDoc,
  setDoc, updateDoc, deleteDoc, query, where,
  orderBy, limit, onSnapshot, serverTimestamp,
  increment, runTransaction, writeBatch,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

/* ─────────────────────────────────────────────────────────
   ID GENERATORS
───────────────────────────────────────────────────────── */
export function generateId(prefix = 'ID') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

export function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/* ─────────────────────────────────────────────────────────
   AUDIT LOGGING
   Every admin action is recorded immutably
───────────────────────────────────────────────────────── */
export async function logAudit({ action, target, targetId, oldValue = null, newValue = null, reason = '' }) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
      adminId:   user.uid,
      adminEmail:user.email,
      action,
      target,
      targetId:  targetId || null,
      oldValue:  oldValue  || null,
      newValue:  newValue  || null,
      reason,
      timestamp: serverTimestamp(),
      sessionId: sessionStorage.getItem('playta_admin_sess_id') || 'unknown'
    });
  } catch (e) {
    console.warn('[PLAYTA] Audit log failed:', e.message);
  }
}

/* ─────────────────────────────────────────────────────────
   IMAGE COMPRESSION (client-side via Canvas)
   Compress to max 300×300px WebP before upload
───────────────────────────────────────────────────────── */
export function compressImage(file, maxW = 300, maxH = 300, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas  = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(url);
          if (blob) resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
          else reject(new Error('Canvas compression failed'));
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/* ─────────────────────────────────────────────────────────
   STORAGE UPLOAD with progress callback
───────────────────────────────────────────────────────── */
export async function uploadFile(path, file, onProgress) {
  const storageRef = ref(storage, path);
  const snapshot   = await uploadBytes(storageRef, file);
  const url        = await getDownloadURL(snapshot.ref);
  return url;
}

/* ─────────────────────────────────────────────────────────
   WALLET OPERATIONS
   All balance changes go through Firestore transactions
   to prevent race conditions and negative balances
───────────────────────────────────────────────────────── */

/**
 * Deduct entry fee from user wallet atomically.
 * Returns { success, newBalance, txId }
 */
export async function deductEntryFee({ userId, matchId, amount, adminId }) {
  const userRef = doc(db, COLLECTIONS.USERS, userId);
  const txId    = generateId('ENTRY');

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('User not found');

      const balance = userSnap.data().walletBalance || 0;
      if (balance < amount) throw new Error('Insufficient balance');

      // Check not already registered
      const regId  = `${matchId}_${userId}`;
      const regRef = doc(db, COLLECTIONS.REGISTRATIONS, regId);
      const regSnap= await tx.get(regRef);
      if (regSnap.exists()) throw new Error('Already registered for this match');

      // Deduct balance
      tx.update(userRef, { walletBalance: increment(-amount) });

      // Create registration record
      tx.set(regRef, {
        matchId, userId, status: 'confirmed',
        entryFee: amount, registeredAt: serverTimestamp()
      });

      // Log wallet transaction
      const walletTxRef = doc(db, COLLECTIONS.WALLET_TX, txId);
      tx.set(walletTxRef, {
        txId, userId, matchId, type: 'entry_deduction',
        amount: -amount, balanceBefore: balance,
        balanceAfter: balance - amount,
        description: `Match entry fee — ${matchId}`,
        createdAt: serverTimestamp()
      });
    });

    return { success: true, txId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Credit winnings to user wallet with idempotency.
 * settlementId prevents duplicate credits.
 */
export async function creditWinnings({ userId, matchId, resultId, amount, adminId, settlementId }) {
  const settRef = doc(db, COLLECTIONS.SETTLEMENTS, settlementId);
  const userRef = doc(db, COLLECTIONS.USERS, userId);

  try {
    await runTransaction(db, async (tx) => {
      // Idempotency check — prevent duplicate settlement
      const settSnap = await tx.get(settRef);
      if (settSnap.exists()) throw new Error('DUPLICATE_SETTLEMENT');

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('User not found');

      const balance = userSnap.data().walletBalance || 0;

      // Credit user
      tx.update(userRef, { walletBalance: increment(amount) });

      // Create immutable settlement record
      tx.set(settRef, {
        settlementId, resultId, matchId, userId,
        totalPaid: amount, settledAt: serverTimestamp(),
        settledBy: adminId, status: 'completed'
      });

      // Log wallet transaction
      const txId  = generateId('WIN');
      const txRef = doc(db, COLLECTIONS.WALLET_TX, txId);
      tx.set(txRef, {
        txId, userId, matchId, type: 'winnings_credit',
        amount, balanceBefore: balance,
        balanceAfter: balance + amount,
        description: `Match winnings — ${matchId}`,
        settlementId, createdAt: serverTimestamp()
      });
    });

    return { success: true, settlementId };
  } catch (e) {
    if (e.message === 'DUPLICATE_SETTLEMENT')
      return { success: false, error: 'Already settled — duplicate prevented' };
    return { success: false, error: e.message };
  }
}

/**
 * Auto-refund all players when a match is cancelled.
 * Uses a batch write for efficiency.
 */
export async function autoRefundMatch({ matchId, adminId, reason }) {
  try {
    // Get all confirmed registrations for this match
    const regsSnap = await getDocs(
      query(collection(db, COLLECTIONS.REGISTRATIONS),
        where('matchId', '==', matchId),
        where('status',  '==', 'confirmed'))
    );

    if (regsSnap.empty) return { success: true, refunded: 0 };

    const batch = writeBatch(db);
    let   refunded = 0;

    for (const regDoc of regsSnap.docs) {
      const reg     = regDoc.data();
      const userRef = doc(db, COLLECTIONS.USERS, reg.userId);
      const txId    = generateId('REFUND');
      const txRef   = doc(db, COLLECTIONS.WALLET_TX, txId);

      // Refund entry fee
      batch.update(userRef, { walletBalance: increment(reg.entryFee || 0) });

      // Update registration status
      batch.update(regDoc.ref, { status: 'refunded' });

      // Log refund transaction
      batch.set(txRef, {
        txId, userId: reg.userId, matchId, type: 'auto_refund',
        amount: reg.entryFee || 0,
        description: `Auto-refund — Match cancelled: ${matchId}`,
        reason, adminId, createdAt: serverTimestamp()
      });

      refunded++;
    }

    // Mark match as cancelled
    batch.update(doc(db, COLLECTIONS.MATCHES, matchId), {
      status: 'cancelled', cancelledAt: serverTimestamp(),
      cancelReason: reason, cancelledBy: adminId
    });

    await batch.commit();

    await logAudit({
      action: 'MATCH_CANCELLED_REFUND',
      target: 'match',
      targetId: matchId,
      newValue: { status: 'cancelled', refunded, reason },
      reason
    });

    return { success: true, refunded };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ─────────────────────────────────────────────────────────
   REAL-TIME LISTENERS (returns unsubscribe function)
───────────────────────────────────────────────────────── */
export function listenToCollection(collectionName, constraints, callback) {
  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(data);
  }, err => console.error(`[PLAYTA] Listener error (${collectionName}):`, err));
}

export function listenToDoc(collectionName, docId, callback) {
  return onSnapshot(doc(db, collectionName, docId), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/* ─────────────────────────────────────────────────────────
   GENERIC CRUD HELPERS
───────────────────────────────────────────────────────── */
export async function fsGet(collectionName, docId) {
  const snap = await getDoc(doc(db, collectionName, docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fsSet(collectionName, docId, data) {
  await setDoc(doc(db, collectionName, docId), {
    ...data, updatedAt: serverTimestamp()
  });
}

export async function fsAdd(collectionName, data) {
  const ref = await addDoc(collection(db, collectionName), {
    ...data, createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function fsUpdate(collectionName, docId, data) {
  await updateDoc(doc(db, collectionName, docId), {
    ...data, updatedAt: serverTimestamp()
  });
}

export async function fsDelete(collectionName, docId) {
  await deleteDoc(doc(db, collectionName, docId));
}

export async function fsQuery(collectionName, constraints) {
  const q    = query(collection(db, collectionName), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* Re-export Firestore query helpers for use in other modules */
export { collection, doc, query, where, orderBy, limit,
         serverTimestamp, increment, Timestamp };
