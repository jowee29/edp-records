import edpLogo from '../assets/edp-logo.png';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const authEmail = username => `${String(username).trim().toLowerCase()}@edp-records.local`;
const validUsername = value => /^[a-z0-9._-]{3,30}$/.test(value);

export function Login(){
 const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const navigate=useNavigate();
 const submit=async e=>{e.preventDefault();setError('');try{
   const clean=username.trim().toLowerCase();
   await signInWithEmailAndPassword(auth,authEmail(clean),password); navigate('/dashboard');
 }catch(err){setError(err.code?.startsWith('auth/')?'Invalid username or password.':err.message)}};
 return <AuthCard title="EDP Records"><p className="muted">Sign in to your account</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>Login</button>{error&&<p className="error">{error}</p>}</form><div className="auth-links"><Link to="/forgot-password">Forgot password?</Link><span>·</span><Link to="/signup">Create account</Link></div></AuthCard>
}

export function Signup(){
 const [form,setForm]=useState({name:'',username:'',password:'',confirm:''}); const [error,setError]=useState(''); const [loading,setLoading]=useState(false); const navigate=useNavigate();
 const submit=async e=>{e.preventDefault();setError('');setLoading(true);try{
   const name=form.name.trim(); const username=form.username.trim().toLowerCase();
   if(!name) throw new Error('Please enter your full name.');
   if(!validUsername(username)) throw new Error('Username must be 3-30 characters and use only letters, numbers, dot, underscore, or dash.');
   if(form.password.length<6) throw new Error('Password must be at least 6 characters.');
   if(form.password!==form.confirm) throw new Error('Passwords do not match.');
   const cred=await createUserWithEmailAndPassword(auth,authEmail(username),form.password);
   await setDoc(doc(db,'users',cred.user.uid),{uid:cred.user.uid,name,username,role:'employee',employeeId:'',department:'',position:'',status:'active',createdAt:serverTimestamp()});
   navigate('/dashboard');
 }catch(err){setError(err.code==='auth/email-already-in-use'?'Username already exists.':err.message)}finally{setLoading(false)}};
 return <AuthCard title="Create account"><p className="muted">Create your EDP Records account</p><form onSubmit={submit}><input placeholder="Full name" autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="Username" autoComplete="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required/><input placeholder="Password" type="password" autoComplete="new-password" minLength="6" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/><input placeholder="Confirm password" type="password" autoComplete="new-password" minLength="6" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})} required/><button disabled={loading}>{loading?'Creating...':'Create Account'}</button>{error&&<p className="error">{error}</p>}</form><p><Link to="/login">Back to login</Link></p></AuthCard>
}

export function ForgotPassword(){
 const [username,setUsername]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 const submit=e=>{e.preventDefault();setError('');setMessage('');setError('For security, password resets are handled by the Super Admin. Please contact your Super Admin to reset your password.')};
 return <AuthCard title="Reset password"><p className="muted">Enter your username to request a password reset.</p><form onSubmit={submit}><input placeholder="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><button>Request reset</button>{message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}</form><p><Link to="/login">Back to login</Link></p></AuthCard>
}
function AuthCard({title,children}){return <div className="auth-page"><div className="content-card auth-card"><div className="brand-lockup auth-brand"><img className="brand-logo-img auth-logo-img" src={edpLogo} alt="EDP logo" /><span><strong>EDP Records</strong><small>STOCK LEDGER &amp; TRACKING</small></span></div><h1>{title}</h1>{children}</div></div>}
