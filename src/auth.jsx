import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext(null);
const INACTIVITY_LIMIT = 5 * 60 * 60 * 1000; // 5 hours
const SESSION_KEY = 'edpActiveSessionId';

export function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function activateLoginSession(uid, sessionId) {
  await setDoc(doc(db, 'activeSessions', uid), {
    uid,
    sessionId,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp()
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timer;
    let stopSessionListener = () => {};
    let signingOutForAnotherDevice = false;

    const resetInactivityTimer = () => {
      if (!auth.currentUser) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!auth.currentUser) return;
        sessionStorage.setItem('edpSessionExpired', '1');
        try { await signOut(auth); } catch {}
      }, INACTIVITY_LIMIT);
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const unsubscribe = onAuthStateChanged(auth, async u => {
      stopSessionListener();
      stopSessionListener = () => {};
      signingOutForAnotherDevice = false;
      setUser(u);

      if (!u) {
        setProfile(null);
        clearTimeout(timer);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        setProfile(snap.exists() ? { uid: u.uid, ...snap.data() } : null);

        const sessionId = localStorage.getItem(SESSION_KEY);
        if (!sessionId) {
          // A Firebase Auth session that was created outside this app's login flow
          // must not remain active without a single-device session record.
          sessionStorage.setItem('edpSessionReauthRequired', '1');
          await signOut(auth);
          return;
        }

        const sessionRef = doc(db, 'activeSessions', u.uid);
        const enforceSession = async sessionSnap => {
          if (signingOutForAnotherDevice) return;
          const activeSessionId = sessionSnap.exists() ? sessionSnap.data()?.sessionId : null;
          if (activeSessionId !== sessionId) {
            signingOutForAnotherDevice = true;
            sessionStorage.setItem('edpLoggedOutOtherDevice', '1');
            localStorage.removeItem(SESSION_KEY);
            try { await signOut(auth); } catch {}
          }
        };
        stopSessionListener = onSnapshot(sessionRef, enforceSession, async () => {
          // Do not keep an authenticated screen open if the session record can no longer be verified.
          if (signingOutForAnotherDevice) return;
          signingOutForAnotherDevice = true;
          sessionStorage.setItem('edpSessionVerificationFailed', '1');
          localStorage.removeItem(SESSION_KEY);
          try { await signOut(auth); } catch {}
        });

        // Also verify when the tab becomes active again. This catches cases where
        // a browser throttles background realtime callbacks.
        const verifyOnFocus = async () => {
          if (!auth.currentUser || signingOutForAnotherDevice) return;
          try { await enforceSession(await getDoc(sessionRef)); } catch {}
        };
        const focusHandler = () => { void verifyOnFocus(); };
        window.addEventListener('focus', focusHandler);
        const previousStop = stopSessionListener;
        stopSessionListener = () => { previousStop(); window.removeEventListener('focus', focusHandler); };

        resetInactivityTimer();
      } catch {
        sessionStorage.setItem('edpSessionVerificationFailed', '1');
        localStorage.removeItem(SESSION_KEY);
        try { await signOut(auth); } catch {}
      } finally {
        setLoading(false);
      }
    });

    activityEvents.forEach(event => window.addEventListener(event, resetInactivityTimer, { passive: true }));
    return () => {
      unsubscribe();
      stopSessionListener();
      clearTimeout(timer);
      activityEvents.forEach(event => window.removeEventListener(event, resetInactivityTimer));
    };
  }, []);

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    setProfile(snap.exists() ? { uid: auth.currentUser.uid, ...snap.data() } : null);
  };

  const logout = async () => {
    localStorage.removeItem(SESSION_KEY);
    await signOut(auth);
  };

  return <AuthContext.Provider value={{ user, profile, loading, logout, refreshProfile }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const audit = async ({ action, details = '', targetUserId = '' }) => {
  const u = auth.currentUser;
  if (!u) return;
  const p = (await getDoc(doc(db, 'users', u.uid))).data();
  await setDoc(doc(db, 'auditLogs', `${Date.now()}_${u.uid}`), {
    userId: u.uid,
    userName: p?.name || p?.username || u.email,
    action,
    details,
    targetUserId,
    createdAt: serverTimestamp()
  });
};
