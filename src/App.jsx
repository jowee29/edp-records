import edpLogo from './assets/edp-logo.png';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, audit } from './auth';
import { Login, Signup, ForgotPassword } from './pages/Auth';
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
  if(roles&&!roles.includes(profile.role))return <Navigate to="/dashboard" replace/>;
  return children;
}

function Layout({children}){
  const {profile,logout}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const nav=async()=>{await audit({action:'LOGOUT',details:'User logged out'});await logout();navigate('/login')};
  const navItems=[
    {to:'/dashboard',label:'Dashboard'},
    ...(profile?.role==='super_admin' ? [{to:'/users',label:'Users'}] : []),
    ...(profile?.role==='admin'||profile?.role==='employee'||profile?.role==='super_admin' ? [{to:'/branches',label:'Branches'},{to:'/accomplishment',label:'Add Accomplishment'},{to:'/accomplishment-history',label:'Accomplishment History'}] : []),
    ...(profile?.role==='super_admin' ? [{to:'/groups',label:'Groups'},{to:'/audit-logs',label:'Audit Logs'}] : []),
    {to:'/profile',label:'My Profile'}
  ];
  const roleLabel=(profile?.role||'employee').replace('_',' ').toUpperCase();
  return <div className="site-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink to="/dashboard" className="brand-lockup">
          <img className="brand-logo-img" src={edpLogo} alt="EDP logo" />
          <span><strong>EDP Records</strong><small>STOCK LEDGER &amp; TRACKING</small></span>
        </NavLink>
        <div className="top-actions">
          <button className="icon-btn" aria-label="Notifications">●</button>
          <span className="role-chip">{roleLabel}</span>
          <span className="account-email">{profile?.email}</span>
          <NavLink className="outline-btn" to="/profile">My Profile</NavLink>
          <button className="outline-btn" onClick={nav}>Log Out</button>
        </div>
      </div>
      <div className="nav-wrap">
        <nav className="main-nav">
          {navItems.map(item=><NavLink key={item.to} to={item.to} className={({isActive})=>`nav-tab ${isActive?'active':''}`}>{item.label}</NavLink>)}
        </nav>
      </div>
    </header>
    <main className="page-container">
      <div className="route-label">{location.pathname==='/dashboard'?'OVERVIEW':location.pathname.replace('/','').replaceAll('-',' ').toUpperCase()}</div>
      {children}
    </main>
  </div>
}

export default function App(){
  const {user}=useAuth();
  return <Routes>
    <Route path="/login" element={user?<Navigate to="/dashboard" replace/>:<Login/>}/>
    <Route path="/signup" element={user?<Navigate to="/dashboard" replace/>:<Signup/>}/>
    <Route path="/forgot-password" element={user?<Navigate to="/dashboard" replace/>:<ForgotPassword/>}/>
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
