const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

async function callerProfile(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const snap = await db.doc(`users/${request.auth.uid}`).get();
  if (!snap.exists || snap.data().role !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Super Admin access required.');
  }
  return snap.data();
}

// Called after the signed-in user has successfully changed their Firebase Auth password.
// The password itself is never sent to this function.
exports.completePasswordChange = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const ref = db.doc(`users/${request.auth.uid}`);
  await ref.update({ mustChangePassword: false, passwordChangedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

// Super Admin can issue a temporary password to an Employee/Admin.
// The target is forced to perform the one-time password change on next login.
exports.resetUserPassword = onCall(async (request) => {
  await callerProfile(request);
  const { uid, temporaryPassword } = request.data || {};
  if (!uid || typeof temporaryPassword !== 'string' || temporaryPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'A valid user ID and temporary password (6+ characters) are required.');
  }
  const target = await db.doc(`users/${uid}`).get();
  if (!target.exists || !['employee','admin'].includes(target.data().role)) {
    throw new HttpsError('failed-precondition', 'Only Employee/Admin accounts can be reset here.');
  }
  await getAuth().updateUser(uid, { password: temporaryPassword });
  await db.doc(`users/${uid}`).update({
    mustChangePassword: true,
    passwordResetAt: FieldValue.serverTimestamp(),
    passwordResetBy: request.auth.uid
  });
  return { ok: true };
});
