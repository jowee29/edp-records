import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { NavLink } from 'react-router-dom';

const Stat=({label,value,caption,icon,trend})=><div className="stat-card premium-stat">
  <div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-caption">{caption}</span></div>
  <strong>{value}</strong><div className="stat-foot"><span className="stat-label">{label}</span>{trend&&<span className="stat-trend">{trend}</span>}</div>
</div>;

const Action=({to,title,text,icon,accent})=><NavLink to={to} className={`action-card ${accent?'action-accent':''}`}><span className="action-icon">{icon}</span><div><strong>{title}</strong><p>{text}</p></div><span className="action-arrow">→</span></NavLink>;

export default function Dashboard(){
 const {profile}=useAuth();
 const [stats,setStats]=useState({users:0,employees:0,admins:0,active:0,branches:0,accomplishments:0});
 const [recent,setRecent]=useState([]);
 const role=profile?.role||'employee';
 useEffect(()=>{
   let alive=true;
   (async()=>{
     try{
       if(role==='employee')return;
       const reads=[getDocs(collection(db,'users')),getDocs(collection(db,'branches'))];
       if(role==='super_admin') reads.push(getDocs(collection(db,'auditLogs')));
       const results=await Promise.all(reads);
       const us=results[0], bs=results[1], logs=results[2];
       let employees=0,admins=0,active=0;
       us.forEach(d=>{const x=d.data(); if(x.role==='employee')employees++; if(x.role==='admin')admins++; if((x.status||'active')==='active')active++});
       const rows=[];
       logs?.forEach(d=>{const x=d.data(); rows.push({id:d.id,action:x.action||'System activity',details:x.details||'',createdAt:x.createdAt?.toDate?.()||null})});
       rows.sort((a,b)=>(b.createdAt?.getTime?.()||0)-(a.createdAt?.getTime?.()||0));
       if(alive)setStats({users:us.size,employees,admins,active,branches:bs.size,accomplishments:0}),setRecent(rows.slice(0,5));
     }catch(err){console.error('Dashboard stats:',err)}
   })();
   return()=>{alive=false};
 },[role]);

 const name=profile?.name||profile?.email?.split('@')[0]||'User';
 const initials=name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
 const formattedRecent=useMemo(()=>recent.map(r=>({...r,time:r.createdAt? r.createdAt.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Recent'})),[recent]);

 if(role==='employee') return <section>
   <div className="dashboard-hero employee-hero"><div><span className="welcome-kicker">EMPLOYEE PORTAL</span><h1>Good day, {name}.</h1><p>Welcome to EDP Records. Manage your branch visits and accomplishment records from one place.</p></div><div className="hero-role"><span className="pulse"></span> EMPLOYEE</div></div>
   <div className="profile-summary"><div className="profile-avatar">{initials}</div><div><span>YOUR ACCOUNT</span><strong>{profile?.employeeId||'Employee ID not assigned'}</strong><small>{profile?.department||'Department not assigned'} • {profile?.position||'Position not assigned'}</small></div><NavLink to="/profile" className="secondary-btn">View Profile</NavLink></div>
   <div className="section-heading"><div><span>WORKSPACE</span><h2>What would you like to do?</h2></div></div>
   <div className="action-grid"><Action to="/branches" title="View Branches" text="Browse branch information and connectivity details." icon="⌂"/><Action to="/accomplishment" title="Add Accomplishment" text="Record a new branch visit and print the A4 form." icon="＋"/><Action to="/accomplishment-history" title="Accomplishment History" text="Review, view and print your previous records." icon="↻"/></div>
 </section>;

 const isSuper=role==='super_admin';
 if(!isSuper) return <section>
   <div className="dashboard-hero"><div><span className="welcome-kicker">ADMIN PORTAL</span><h1>Welcome back, {name}.</h1><p>Manage branch operations and accomplishment records for your assigned workspace.</p></div><div className="hero-role"><span className="pulse"></span> ADMIN</div></div>
   <div className="stats-grid"><Stat label="Total Branches" value={stats.branches} caption="DATABASE" icon="⌂"/><Stat label="Active Accounts" value={stats.active} caption="STATUS" icon="✓"/><Stat label="Employees" value={stats.employees} caption="TEAM" icon="◎"/><Stat label="Assigned Workspace" value={profile?.groupId?'1':'—'} caption="GROUP" icon="◆"/></div>
   <div className="dashboard-columns"><div><div className="section-heading"><div><span>QUICK ACTIONS</span><h2>Common tasks</h2></div></div><div className="action-grid"><Action to="/branches" title="Branch Management" text="Add, edit, import and view branch connectivity details." icon="⌂"/><Action to="/accomplishment" title="New Accomplishment" text="Create a branch visit accomplishment form." icon="＋"/><Action to="/accomplishment-history" title="Accomplishment History" text="View and print saved accomplishment records." icon="↻"/></div></div><div className="system-card"><div className="system-card-head"><div><span>SYSTEM STATUS</span><h2>EDP Records</h2></div><span className="online-badge"><i/> Online</span></div><div className="status-row"><span>Firebase Database</span><strong>Connected</strong></div><div className="status-row"><span>Account Role</span><strong>ADMIN</strong></div><div className="status-row"><span>Access Level</span><strong>Workspace Access</strong></div></div></div>
 </section>;

 return <section className="super-dashboard">
   <div className="premium-hero">
     <div className="hero-glow"></div><div className="premium-hero-copy"><div className="welcome-line"><span className="welcome-kicker">EXECUTIVE OVERVIEW</span><span className="secure-badge">● SYSTEM SECURE</span></div><h1>Good evening, {name}.</h1><p>Here’s your command center for users, branches, records and system activity.</p><div className="hero-meta"><span><i></i> Firebase Connected</span><span>Last session: Active</span></div></div>
     <div className="hero-profile"><div className="hero-profile-avatar">{initials}</div><div><small>SIGNED IN AS</small><strong>{profile?.name||'Super Administrator'}</strong><span>SUPER ADMINISTRATOR</span></div></div>
   </div>

   <div className="stats-grid premium-stats-grid">
     <Stat label="Total Branches" value={stats.branches} caption="OPERATIONS" icon="⌂" trend="Live"/>
     <Stat label="Total Users" value={stats.users} caption="DIRECTORY" icon="◎" trend="Accounts"/>
     <Stat label="Admin Accounts" value={stats.admins} caption="PRIVILEGED" icon="◆" trend="Access"/>
     <Stat label="Active Accounts" value={stats.active} caption="SECURITY" icon="✓" trend="Healthy"/>
   </div>

   <div className="premium-grid">
     <div className="premium-main">
       <div className="section-heading premium-heading"><div><span>COMMAND CENTER</span><h2>Quick actions</h2></div><span className="section-note">4 modules</span></div>
       <div className="action-grid premium-actions">
         <Action to="/users" title="User Management" text="Control accounts, roles and access status." icon="◎" accent/>
         <Action to="/branches" title="Branch Management" text="Manage branch records and connectivity details." icon="⌂"/>
         <Action to="/accomplishment" title="New Accomplishment" text="Create and print a professional A4 visit form." icon="＋"/>
         <Action to="/accomplishment-history" title="Accomplishment History" text="Review and print completed branch visits." icon="↻"/>
       </div>

       <div className="overview-card">
         <div className="section-heading"><div><span>USER DISTRIBUTION</span><h2>Access overview</h2></div></div>
         <div className="distribution"><div className="distribution-total"><strong>{stats.users}</strong><span>Total accounts</span></div><div className="distribution-bars"><div className="bar-row"><span>Employees</span><div><i style={{width:`${stats.users?Math.max(4,stats.employees/stats.users*100):4}%`}}></i></div><b>{stats.employees}</b></div><div className="bar-row"><span>Admins</span><div><i style={{width:`${stats.users?Math.max(4,stats.admins/stats.users*100):4}%`}}></i></div><b>{stats.admins}</b></div><div className="bar-row"><span>Active</span><div><i style={{width:`${stats.users?Math.max(4,stats.active/stats.users*100):4}%`}}></i></div><b>{stats.active}</b></div></div></div>
       </div>
     </div>

     <aside className="premium-side">
       <div className="system-card premium-system"><div className="system-card-head"><div><span>SYSTEM HEALTH</span><h2>All services</h2></div><span className="online-badge"><i/> Healthy</span></div><div className="health-item"><span><i/> Firebase Auth</span><b>Operational</b></div><div className="health-item"><span><i/> Firestore</span><b>Operational</b></div><div className="health-item"><span><i/> Application</span><b>Operational</b></div><div className="health-score"><div><strong>100%</strong><span>System availability</span></div><div className="score-ring">✓</div></div></div>
       <div className="activity-card"><div className="section-heading"><div><span>SECURITY FEED</span><h2>Recent activity</h2></div><NavLink to="/audit-logs">View all</NavLink></div>{formattedRecent.length?formattedRecent.map((r,i)=><div className="activity-row" key={r.id}><span className="activity-dot">{i===0?'•':'✓'}</span><div><strong>{r.action}</strong><p>{r.details||'System activity recorded'}</p><small>{r.time}</small></div></div>):<div className="empty-activity">No recent activity available.</div>}</div>
     </aside>
   </div>
 </section>;
}
