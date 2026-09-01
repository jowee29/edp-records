import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [profile, setProfile] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, async u => { setUser(u); if (u) { const snap = await getDoc(doc(db,'users',u.uid)); setProfile(snap.exists()?{uid:u.uid,...snap.data()}:null); } else setProfile(null); setLoading(false); }), []);
  const refreshProfile = async () => { if (!auth.currentUser) return; const snap=await getDoc(doc(db,'users',auth.currentUser.uid)); setProfile(snap.exists()?{uid:auth.currentUser.uid,...snap.data()}:null); };
  const logout = async () => signOut(auth);
  return <AuthContext.Provider value={{user,profile,loading,logout,refreshProfile}}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
export const audit = async ({action, details='', targetUserId=''}) => {
  const u=auth.currentUser; if(!u) return;
  const p=(await getDoc(doc(db,'users',u.uid))).data();
  await setDoc(doc(db,'auditLogs',`${Date.now()}_${u.uid}`), {userId:u.uid,userName:p?.name||p?.username||u.email,action,details,targetUserId,createdAt:serverTimestamp()});
};
