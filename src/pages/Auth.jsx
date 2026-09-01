import edpLogo from '../assets/edp-logo.png';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth';
import { auth, db } from '../firebase';

const authEmail = username => `${String(username).trim().toLowerCase()}@edp-records.local`;

export function Login(){
 const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const navigate=useNavigate();
 const submit=async e=>{e.preventDefault();setError('');try{
   const clean=username.trim().toLowerCase();
   await signInWithEmailAndPassword(auth,authEmail(clean),password); navigate('/dashboard');
 }catch(err){setError(err.code?.startsWith('auth/')?'Invalid username or password.':err.message)}};
 return <AuthCard title="EDP Records"><p className="muted">Sign in to your account</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>Login</button>{error&&<p className="error">{error}</p>}</form><div className="auth-links"><Link to="/forgot-password">Forgot password?</Link></div></AuthCard>
}

export function ForgotPassword(){
 const [username,setUsername]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 const submit=e=>{e.preventDefault();setError('');setMessage('');setError('Password recovery is handled by a Super Admin. Please contact your Super Admin. If the forgotten password belongs to the Super Admin account itself, another Super Admin or the Firebase project administrator must perform the recovery.')};
 return <AuthCard title="Reset password"><p className="muted">Enter your username to request a password reset.</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><button>Request reset</button>{message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}</form><p><Link to="/login">Back to login</Link></p></AuthCard>
}

export function ChangePassword(){
 const {user,profile,refreshProfile}=useAuth();
 const [current,setCurrent]=useState(''); const [next,setNext]=useState(''); const [confirm,setConfirm]=useState('');
 const [error,setError]=useState(''); const [message,setMessage]=useState(''); const navigate=useNavigate();
 const isSuper=profile?.role==='super_admin';
 const submit=async e=>{e.preventDefault();setError('');setMessage('');
   if(next.length<6){setError('New password must be at least 6 characters.');return}
   if(next!==confirm){setError('New passwords do not match.');return}
   try{
     const credential=EmailAuthProvider.credential(user.email,current);
     await reauthenticateWithCredential(user,credential);
     await updatePassword(user,next);
     const functions = getFunctions();
     await httpsCallable(functions,'completePasswordChange')();
     await refreshProfile();
     setMessage('Password changed successfully.');
     if(!isSuper) setTimeout(()=>navigate('/dashboard'),500);
   }catch(err){setError(err.code==='auth/wrong-password'?'Current password is incorrect.':err.message)}
 };
 return <div className="auth-page"><div className="content-card auth-card">
   <div className="brand-lockup auth-brand"><img className="brand-logo-img auth-logo-img" src={edpLogo} alt="EDP logo" /><span><strong>EDP Records</strong><small>STOCK LEDGER &amp; TRACKING</small></span></div>
   <h1>{isSuper?'Change Password':'One-Time Password Change'}</h1>
   <p className="muted">{isSuper?'Change your Super Admin password anytime.':'For security, you must change your temporary password before continuing.'}</p>
   <form onSubmit={submit}>
     <input placeholder="Current password" type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} required/>
     <input placeholder="New password" type="password" autoComplete="new-password" minLength="6" value={next} onChange={e=>setNext(e.target.value)} required/>
     <input placeholder="Confirm new password" type="password" autoComplete="new-password" minLength="6" value={confirm} onChange={e=>setConfirm(e.target.value)} required/>
     <button>{isSuper?'Change Password':'Set New Password'}</button>
     {message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}
   </form>
   {isSuper&&<p className="muted" style={{marginTop:12}}>Forgot your Super Admin password? Recovery requires another Super Admin or the Firebase project administrator because username login uses an internal authentication address.</p>}
 </div></div>
}

function AuthCard({title,children}){return <div className="auth-page"><div className="content-card auth-card"><div className="brand-lockup auth-brand"><img className="brand-logo-img auth-logo-img" src={edpLogo} alt="EDP logo" /><span><strong>EDP Records</strong><small>STOCK LEDGER &amp; TRACKING</small></span></div><h1>{title}</h1>{children}</div></div>}
