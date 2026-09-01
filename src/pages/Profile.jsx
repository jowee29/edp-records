import { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, audit } from '../auth';

export default function Profile(){
 const {profile,refreshProfile}=useAuth();
 const [groups,setGroups]=useState([]);
 const [form,setForm]=useState({...profile});
 const [message,setMessage]=useState('');
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
 return <section><div className="page-title-row"><div><p className="eyebrow">ACCOUNT</p><h1>My Profile</h1></div><span className="role-chip">{(profile?.role||'employee').replace('_',' ').toUpperCase()}</span></div><div className="content-card profile-card"><form onSubmit={save}>
 <label>Name<input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
 <label>Username<input value={form.username||''} disabled/></label>
 <label>Employee ID<input value={form.employeeId||''} onChange={e=>setForm({...form,employeeId:e.target.value})}/></label>
 <label>Department<input value={form.department||''} onChange={e=>setForm({...form,department:e.target.value})}/></label>
 <label>Position<select value={form.position||''} onChange={e=>setForm({...form,position:e.target.value})} required><option value="">Select Position</option><option value="Team Leader">Team Leader</option><option value="IT Staff">IT Staff</option></select></label>
 <label>Group<select value={form.groupId||''} onChange={e=>setForm({...form,groupId:e.target.value})} disabled={loadingGroups}><option value="">Select Group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 <label>Role<input value={form.role||''} disabled/></label>
 <button className="amber-btn">Save Profile</button>{message&&<p className="success">{message}</p>}
 </form></div></section>
}
