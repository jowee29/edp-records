import edpLogo from '../assets/edp-logo.png';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { activateLoginSession, createSessionId } from '../auth';

const authEmail = username => `${String(username).trim().toLowerCase()}@edp-records.local`;

export function Login(){
 const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [sessionExpired,setSessionExpired]=useState(false); const navigate=useNavigate();
 useEffect(()=>{
   if(sessionStorage.getItem('edpSessionExpired')==='1'){ setSessionExpired(true); sessionStorage.removeItem('edpSessionExpired'); }
   if(sessionStorage.getItem('edpLoggedOutOtherDevice')==='1'){ setError('This account was signed in on another device. Your previous session was logged out.'); sessionStorage.removeItem('edpLoggedOutOtherDevice'); }
   if(sessionStorage.getItem('edpSessionVerificationFailed')==='1'){ setError('Your session could not be verified. Please log in again.'); sessionStorage.removeItem('edpSessionVerificationFailed'); }
   if(sessionStorage.getItem('edpSessionReauthRequired')==='1'){ setError('Please log in again to establish a secure device session.'); sessionStorage.removeItem('edpSessionReauthRequired'); }
 },[]);
 const submit=async e=>{e.preventDefault();setError('');setSessionExpired(false);try{
   const clean=username.trim().toLowerCase();
   const sessionId=createSessionId();
   // Store the ID before Firebase emits onAuthStateChanged so the AuthProvider
   // can immediately start watching this exact session.
   localStorage.setItem('edpActiveSessionId',sessionId);
   const credential=await signInWithEmailAndPassword(auth,authEmail(clean),password);
   await activateLoginSession(credential.user.uid,sessionId);
   navigate('/dashboard');
 }catch(err){
   localStorage.removeItem('edpActiveSessionId');
   try { if (auth.currentUser) await auth.signOut(); } catch {}
   setError(err.code?.startsWith('auth/')?'Invalid username or password.':err.message);
 }};
 return <AuthCard title="EDP Records"><p className="muted">Sign in to your account</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>Login</button>{error&&<p className="error">{error}</p>}</form>{sessionExpired&&<p className="error">Session expired due to 5 hours of inactivity. Please log in again.</p>}<div className="auth-links"><Link to="/forgot-password">Forgot password?</Link></div></AuthCard>
}

export function ForgotPassword(){
 const [username,setUsername]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 const submit=e=>{e.preventDefault();setError('');setMessage('');setError('For security, password resets are handled by the Super Admin. Please contact your Super Admin to reset your password.')};
 return <AuthCard title="Reset password"><p className="muted">Enter your username to request a password reset.</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><button>Request reset</button>{message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}</form><p><Link to="/login">Back to login</Link></p></AuthCard>
}
function AuthCard({title,children}){return <div className="auth-page"><div className="content-card auth-card"><div className="brand-lockup auth-brand"><img className="brand-logo-img auth-logo-img" src={edpLogo} alt="EDP logo" /><span><strong>EDP Records</strong><small>STOCK LEDGER &amp; TRACKING</small></span></div><h1>{title}</h1>{children}</div></div>}
