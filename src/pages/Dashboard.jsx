import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';

export default function Dashboard(){
  const {profile}=useAuth();
  const [stats,setStats]=useState({users:0,employees:0,admins:0,active:0});
  useEffect(()=>{
    if(!['admin','super_admin'].includes(profile?.role))return;
    getDocs(collection(db,'users')).then(s=>{
      let employees=0,admins=0,active=0;
      s.forEach(d=>{const r=d.data().role;if(r==='employee')employees++;if(r==='admin'||r==='super_admin')admins++;if((d.data().status||'active')==='active')active++});
      setStats({users:s.size,employees,admins,active});
    });
  },[profile]);

  if(profile?.role==='employee') return <section>
    <div className="hero-row">
      <div><p className="eyebrow">EMPLOYEE PORTAL</p><h1>Welcome back, {profile?.name||'Employee'}</h1><p className="subtext">View your EDP Records account and employee information.</p></div>
      <span className="role-chip large">EMPLOYEE</span>
    </div>
    <div className="metric-grid employee-metrics">
      <Metric label="EMPLOYEE ID" value={profile?.employeeId||'—'}/>
      <Metric label="DEPARTMENT" value={profile?.department||'Not assigned'}/>
      <Metric label="POSITION" value={profile?.position||'Not assigned'}/>
      <Metric label="ACCOUNT STATUS" value={(profile?.status||'active').toUpperCase()} accent="green"/>
    </div>
    <div className="content-card info-panel"><div><p className="eyebrow">ACCOUNT</p><h2>My Profile</h2><p className="subtext">Keep your employee information up to date from the My Profile tab.</p></div><a className="amber-btn" href="/profile">View Profile</a></div>
  </section>;

  return <section>
    <div className="hero-row">
      <div><p className="eyebrow">EDP RECORDS</p><h1>{profile?.role==='super_admin'?'Super Admin Dashboard':'Admin Dashboard'}</h1><p className="subtext">Inventory-style overview of users and system activity.</p></div>
      <button className="amber-btn" onClick={()=>document.getElementById('quick-actions')?.scrollIntoView({behavior:'smooth'})}>+ Quick Action</button>
    </div>
    <div className="metric-grid">
      <Metric label="TOTAL USERS" value={stats.users}/>
      <Metric label="TOTAL EMPLOYEES" value={stats.employees}/>
      <Metric label="ADMIN ACCOUNTS" value={stats.admins}/>
      <Metric label="ACTIVE ACCOUNTS" value={stats.active} accent="green"/>
    </div>
    <div className="dashboard-grid" id="quick-actions">
      <div className="content-card"><p className="eyebrow">SYSTEM STATUS</p><h2>EDP Records is ready</h2><p className="subtext">Use the navigation above to manage users, review audit logs, or update your profile.</p><div className="status-line"><span className="dot green"/> Firebase connected</div></div>
      <div className="content-card"><p className="eyebrow">ROLE ACCESS</p><div className="access-row"><b>Current role</b><span className="role-chip">{(profile?.role||'employee').replace('_',' ').toUpperCase()}</span></div><div className="access-row"><b>User management</b><span>{['admin','super_admin'].includes(profile?.role)?'Available':'Restricted'}</span></div><div className="access-row"><b>Audit logs</b><span>{profile?.role==='super_admin'?'Available':'Restricted'}</span></div></div>
    </div>
  </section>
}
function Metric({label,value,accent}){return <div className={`metric-card ${accent||''}`}><span>{label}</span><strong>{value}</strong></div>}
