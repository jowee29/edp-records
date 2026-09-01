import edpLogo from './assets/edp-logo.png';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth, audit } from './auth';
import { Login, ForgotPassword, ChangePassword } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Profile from './pages/Profile';
import AuditLogs from './pages/AuditLogs';
import Branches from './pages/Branches';
import Accomplishment from './pages/Accomplishment';
import AccomplishmentHistory from './pages/AccomplishmentHistory';
import Groups from './pages/Groups';

function Protected({children,roles}){
  const {user,profile,loading}=useAuth();
  if(loading)return <div className="screen-message">Loading...</div>;
  if(!user)return <Navigate to="/login" replace/>;
  if(!profile)return <div className="screen-message"><div className="dark-card"><h2>Account profile missing</h2><p>Please contact an administrator.</p></div></div>;
  if(profile.status==='inactive')return <div className="screen-message"><div className="dark-card"><h2>Account inactive</h2><p>Please contact an administrator.</p></div></div>;
  if(profile.mustChangePassword && profile.role !== 'super_admin' && window.location.pathname !== '/change-password') return <Navigate to="/change-password" replace/>;
  if(roles&&!roles.includes(profile.role))return <Navigate to="/dashboard" replace/>;
  return children;
}

const Icon=({name})=>{
  const paths={
    grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    branch:<><path d="M3 21h18"/><path d="M6 21V5l6-3 6 3v16"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/></>,
    form:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
    history:<><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,
    groups:<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="3"/><path d="M2 20a7 7 0 0 1 14 0M14 20a6 6 0 0 1 8 0"/></>,
    audit:<><path d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4Z"/><path d="M9 12l2 2 4-4"/></>,
    profile:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    logout:<><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
};

function Layout({children}){
  const {profile,logout}=useAuth();
  const navigate=useNavigate();
  const nav=async()=>{await audit({action:'LOGOUT',details:'User logged out'});await logout();navigate('/login')};
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const role=profile?.role||'employee';
  const roleLabel=role.replace('_',' ').toUpperCase();
  const navItems=[
    {to:'/dashboard',label:'Dashboard',icon:'grid'},
    ...(role==='super_admin' ? [{to:'/users',label:'User Management',icon:'users'}] : []),
    ...(role==='admin'||role==='employee'||role==='super_admin' ? [
      {to:'/branches',label:'Branches',icon:'branch'},
      {to:'/accomplishment',label:'Add Accomplishment',icon:'form'},
      {to:'/accomplishment-history',label:'Accomplishment History',icon:'history'}
    ] : []),
    ...(role==='super_admin' ? [
      {to:'/groups',label:'Groups',icon:'groups'},
      {to:'/audit-logs',label:'Audit Logs',icon:'audit'}
    ] : [])
  ];
  const closeMobileMenu=()=>setMobileMenuOpen(false);
  return <div className={`app-shell ${mobileMenuOpen?'mobile-menu-open':''}`}>
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={edpLogo} alt="EDP"/>
        <div><strong>EDP Records</strong><span>MANAGEMENT SYSTEM</span></div>
      </div>
      <div className="sidebar-section">
        <span className="sidebar-label">MAIN MENU</span>
        <nav className="side-nav">
          {navItems.map(item=><NavLink key={item.to} to={item.to} className={({isActive})=>`side-link ${isActive?'active':''}`}>
            <Icon name={item.icon}/><span>{item.label}</span>
          </NavLink>)}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <span className="sidebar-label">ACCOUNT</span>
        <NavLink to="/profile" className={({isActive})=>`side-link ${isActive?'active':''}`}><Icon name="profile"/><span>My Profile</span></NavLink>
        <div className="sidebar-user">
          <div className="avatar">{(profile?.name||profile?.username||'U').slice(0,1).toUpperCase()}</div>
          <div className="user-copy"><strong>{profile?.name||'User'}</strong><span>{roleLabel}</span></div>
        </div>
        <button className="logout-link" onClick={nav}><Icon name="logout"/><span>Log Out</span></button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="mobile-topbar">
        <button className="mobile-menu-btn" aria-label="Open menu" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(v=>!v)}>
          <span></span><span></span><span></span>
        </button>
        <div className="sidebar-brand"><img src={edpLogo} alt="EDP"/><div><strong>EDP Records</strong><span>MANAGEMENT SYSTEM</span></div></div>
        <NavLink to="/profile" onClick={closeMobileMenu} className="mobile-avatar">{(profile?.name||'U').slice(0,1).toUpperCase()}</NavLink>
      </header>
      <div className={`mobile-menu-backdrop ${mobileMenuOpen?'show':''}`} onClick={closeMobileMenu}></div>
      <aside className={`mobile-drawer ${mobileMenuOpen?'open':''}`}>
        <div className="mobile-drawer-head">
          <div className="sidebar-brand"><img src={edpLogo} alt="EDP"/><div><strong>EDP Records</strong><span>{roleLabel}</span></div></div>
          <button className="mobile-close-btn" onClick={closeMobileMenu} aria-label="Close menu">×</button>
        </div>
        <span className="sidebar-label">MAIN MENU</span>
        <nav className="side-nav">
          {navItems.map(item=><NavLink key={item.to} to={item.to} onClick={closeMobileMenu} className={({isActive})=>`side-link ${isActive?'active':''}`}><Icon name={item.icon}/><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="mobile-drawer-bottom">
          <NavLink to="/profile" onClick={closeMobileMenu} className="side-link"><Icon name="profile"/><span>My Profile</span></NavLink>
          <button className="logout-link" onClick={nav}><Icon name="logout"/><span>Log Out</span></button>
        </div>
      </aside>
      <main className="page-container">{children}</main>
    </div>
  </div>
}

export default function App(){
  const {user}=useAuth();
  return <Routes>
    <Route path="/login" element={user?<Navigate to="/dashboard" replace/>:<Login/>}/>

    <Route path="/forgot-password" element={user?<Navigate to="/dashboard" replace/>:<ForgotPassword/>}/>
    <Route path="/change-password" element={<Protected><ChangePassword/></Protected>}/>
    <Route path="/dashboard" element={<Protected><Layout><Dashboard/></Layout></Protected>}/>
    <Route path="/users" element={<Protected roles={['super_admin']}><Layout><Users/></Layout></Protected>}/>
    <Route path="/branches" element={<Protected roles={['admin','employee','super_admin']}><Layout><Branches/></Layout></Protected>}/>
    <Route path="/groups" element={<Protected roles={['super_admin']}><Layout><Groups/></Layout></Protected>}/>
    <Route path="/accomplishment" element={<Protected roles={['admin','employee','super_admin']}><Layout><Accomplishment/></Layout></Protected>}/>
    <Route path="/accomplishment-history" element={<Protected roles={['admin','employee','super_admin']}><Layout><AccomplishmentHistory/></Layout></Protected>}/>
    <Route path="/audit-logs" element={<Protected roles={['super_admin']}><Layout><AuditLogs/></Layout></Protected>}/>
    <Route path="/profile" element={<Protected><Layout><Profile/></Layout></Protected>}/>
    <Route path="*" element={<Navigate to={user?'/dashboard':'/login'} replace/>}/>
  </Routes>
}
