import edpLogo from '../assets/edp-logo.png';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
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
 const submit=e=>{e.preventDefault();setError('');setMessage('');setError('For security, password resets are handled by the Super Admin. Please contact your Super Admin to reset your password.')};
 return <AuthCard title="Reset password"><p className="muted">Enter your username to request a password reset.</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><button>Request reset</button>{message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}</form><p><Link to="/login">Back to login</Link></p></AuthCard>
}
function AuthCard({title,children}){return <div className="auth-page"><div className="content-card auth-card"><div className="brand-lockup auth-brand"><img className="brand-logo-img auth-logo-img" src={edpLogo} alt="EDP logo" /><span><strong>EDP Records</strong><small>STOCK LEDGER &amp; TRACKING</small></span></div><h1>{title}</h1>{children}</div></div>}
