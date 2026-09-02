import { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, orderBy, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../firebase';
import { useAuth, audit } from '../auth';

export default function Profile(){
 const {profile,refreshProfile}=useAuth();
 const [groups,setGroups]=useState([]);
 const [form,setForm]=useState({...profile});
 const [message,setMessage]=useState('');
 const [passwordMessage,setPasswordMessage]=useState('');
 const [passwordError,setPasswordError]=useState('');
 const [passwordForm,setPasswordForm]=useState({current:'',next:'',confirm:''});
 const [changingPassword,setChangingPassword]=useState(false);
 const [loadingGroups,setLoadingGroups]=useState(true);

 useEffect(()=>{
   getDocs(query(collection(db,'groups'),orderBy('name','asc'))).then(s=>setGroups(s.docs.map(d=>({id:d.id,...d.data()})))).catch(()=>{}).finally(()=>setLoadingGroups(false));
 },[]);

 const save=async e=>{
   e.preventDefault();
   await updateDoc(doc(db,'users',profile.uid),{name:form.name,employeeId:form.employeeId,department:form.department,position:form.position,groupId:form.groupId||'',groupName:groups.find(g=>g.id===form.groupId)?.name||''});
   await audit({action:'UPDATE_PROFILE',details:'Updated own profile'});
   await refreshProfile(); setMessage('Profile updated successfully.');
 };

 const changePassword=async e=>{
   e.preventDefault();
   setPasswordError(''); setPasswordMessage('');
   if(passwordForm.next.length<6){setPasswordError('New password must be at least 6 characters.');return;}
   if(passwordForm.next!==passwordForm.confirm){setPasswordError('New passwords do not match.');return;}
   if(!auth.currentUser?.email){setPasswordError('Unable to identify the signed-in account.');return;}
   setChangingPassword(true);
   try{
     const credential=EmailAuthProvider.credential(auth.currentUser.email,passwordForm.current);
     await reauthenticateWithCredential(auth.currentUser,credential);
     await updatePassword(auth.currentUser,passwordForm.next);
     try{
       const functions=getFunctions();
       await httpsCallable(functions,'completePasswordChange')({});
     }catch(_){}
     await audit({action:'CHANGE_PASSWORD',details:'Changed own password'});
     setPasswordForm({current:'',next:'',confirm:''});
     setPasswordMessage('Password changed successfully.');
     await refreshProfile();
   }catch(err){
     const code=err?.code||'';
     if(code==='auth/invalid-credential'||code==='auth/wrong-password') setPasswordError('Current password is incorrect.');
     else if(code==='auth/weak-password') setPasswordError('New password is too weak.');
     else if(code==='auth/requires-recent-login') setPasswordError('Please log in again before changing your password.');
     else setPasswordError(err?.message||'Unable to change password.');
   }finally{setChangingPassword(false);}
 };

 return <section>
   <div className="page-title-row"><div><p className="eyebrow">ACCOUNT</p><h1>My Profile</h1></div><span className="role-chip">{(profile?.role||'employee').replace('_',' ').toUpperCase()}</span></div>

   <div className="content-card profile-card">
    <form onSubmit={save}>
      <label>Name<input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
      <label>Username<input value={form.username||''} disabled/></label>
      <label>Employee ID<input value={form.employeeId||''} onChange={e=>setForm({...form,employeeId:e.target.value})}/></label>
      <label>Department<input value={form.department||''} onChange={e=>setForm({...form,department:e.target.value})}/></label>
      <label>Position<select value={form.position||''} onChange={e=>setForm({...form,position:e.target.value})} required><option value="">Select Position</option><option value="Team Leader">Team Leader</option><option value="IT Staff">IT Staff</option></select></label>
      <label>Group<select value={form.groupId||''} onChange={e=>setForm({...form,groupId:e.target.value})} disabled={loadingGroups}><option value="">Select Group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>Role<input value={form.role||''} disabled/></label>
      <button className="amber-btn">Save Profile</button>{message&&<p className="success">{message}</p>}
    </form>
   </div>

   <div className="content-card change-password-card">
     <div className="panel-heading">
       <div><p className="eyebrow">SECURITY</p><h2>Change Password</h2><p className="subtext">Available for Super Admin, Admin, and Employee accounts.</p></div>
     </div>
     <form onSubmit={changePassword} className="password-form">
       <label>Current Password<input type="password" autoComplete="current-password" value={passwordForm.current} onChange={e=>setPasswordForm({...passwordForm,current:e.target.value})} required/></label>
       <label>New Password<input type="password" autoComplete="new-password" minLength="6" value={passwordForm.next} onChange={e=>setPasswordForm({...passwordForm,next:e.target.value})} required/></label>
       <label>Confirm New Password<input type="password" autoComplete="new-password" minLength="6" value={passwordForm.confirm} onChange={e=>setPasswordForm({...passwordForm,confirm:e.target.value})} required/></label>
       <button className="amber-btn" disabled={changingPassword}>{changingPassword?'Changing...':'Change Password'}</button>
       {passwordMessage&&<p className="success">{passwordMessage}</p>}
       {passwordError&&<p className="error">{passwordError}</p>}
     </form>
   </div>
 </section>
}
