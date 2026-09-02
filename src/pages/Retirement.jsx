import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';

const blank={branchId:'',branchName:'',assetCode:'',serialNo:'',itemProduct:'',defectiveNote:'',datePurchase:'',dateRetired:'',receivedBy:'',receivedDate:''};
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);
const roleName=r=>r==='super_admin'?'Super Admin':r==='admin'?'Admin':'Employee';

export default function Retirement(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]),[items,setItems]=useState([]),[form,setForm]=useState({...blank});
  const [requests,setRequests]=useState([]),[editing,setEditing]=useState(null),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[confirm,setConfirm]=useState(null);

  const load=async()=>{
    if(!profile)return; setLoading(true); setError('');
    try{
      const bcol=collection(db,'branches');
      let bq=profile.role==='super_admin'?query(bcol,orderBy('createdAt','desc')):query(bcol,where('groupId','==',profile.groupId||'unassigned'));
      let snap; try{snap=await getDocs(bq)}catch(e){snap=await getDocs(profile.role==='super_admin'?bcol:query(bcol,where('groupId','==',profile.groupId||'unassigned')))}
      setBranches(snap.docs.map(d=>({id:d.id,...d.data()})));
      const rcol=collection(db,'retirements');
      let rq=profile.role==='super_admin'?query(rcol,orderBy('createdAt','desc')):query(rcol,where('groupId','==',profile.groupId||'unassigned'));
      try{snap=await getDocs(rq)}catch(e){snap=await getDocs(profile.role==='super_admin'?rcol:query(rcol,where('groupId','==',profile.groupId||'unassigned')))}
      setItems(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      if(profile.role==='super_admin'){
        const qs=await getDocs(query(collection(db,'retirementRequests'),where('status','==','pending')));
        setRequests(qs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      } else setRequests([]);
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selectBranch=id=>{const b=branches.find(x=>x.id===id);setForm(f=>({...f,branchId:id,branchName:b?.branchName||''}))};
  const reset=()=>{setForm({...blank});setEditing(null);setSaved(false);setError('')};

  const requestApproval=async(action, data, retirementId='')=>{
    const requestRef=doc(collection(db,'retirementRequests'));
    const notificationRef=doc(collection(db,'notifications'));
    const actor=profile.name||profile.username||profile.email||'User';
    const title=action==='delete'?'Retirement deletion approval required':'Retirement edit approval required';
    const description=action==='delete'
      ? `${actor} (${roleName(profile.role)}) requested permission to delete retirement ${data.assetCode||data.itemProduct||retirementId}.`
      : `${actor} (${roleName(profile.role)}) requested permission to edit retirement ${data.assetCode||data.itemProduct||retirementId}.`;
    const batch=writeBatch(db);
    batch.set(requestRef,{action,retirementId,requestedData:data,groupId:profile.groupId||'unassigned',requestedBy:profile.uid,requestedByName:actor,requestedByRole:profile.role,status:'pending',createdAt:serverTimestamp()});
    batch.set(notificationRef,{type:'RETIREMENT_APPROVAL',requestId:requestRef.id,recipientRole:'super_admin',title,message:description,read:false,createdAt:serverTimestamp()});
    await batch.commit();
    await audit({action:action==='delete'?'REQUEST_DELETE_RETIREMENT':'REQUEST_UPDATE_RETIREMENT',details:description,targetUserId:retirementId||requestRef.id});
  };

  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');setSaved(false);
    try{
      const payload={...form,groupId:profile.groupId||'unassigned'};
      if(editing){
        if(profile.role==='super_admin'){
          await updateDoc(doc(db,'retirements',editing),{...payload,updatedAt:serverTimestamp()});
          await audit({action:'UPDATE_RETIREMENT',details:`Updated retirement record for ${form.assetCode||form.itemProduct}`,targetUserId:editing});
        } else {
          await requestApproval('edit',payload,editing);
          setSaved(true); reset();
          return;
        }
      } else {
        payload.createdBy=profile.uid;payload.createdByName=profile.name||profile.username||'';payload.createdAt=serverTimestamp();
        const ref=await addDoc(collection(db,'retirements'),payload);
        await audit({action:'CREATE_RETIREMENT',details:`Created retirement record for ${form.assetCode||form.itemProduct}`,targetUserId:ref.id});
      }
      await load();setSaved(true);reset();
    }catch(e){setError(e.message)}finally{setSaving(false)}
  };
  const edit=x=>{setEditing(x.id);setForm({...blank,...x});window.scrollTo({top:0,behavior:'smooth'})};

  const approve=async r=>{
    setSaving(true);setError('');
    try{
      const item=r.requestedData||{};
      if(r.action==='delete'){ continue; } else {
        await updateDoc(doc(db,'retirements',r.retirementId),{...item,updatedAt:serverTimestamp(),approvedBy:profile.uid,approvedAt:serverTimestamp()});
        await audit({action:'APPROVE_UPDATE_RETIREMENT',details:`Approved retirement edit requested by ${r.requestedByName}`,targetUserId:r.retirementId});
      }
      await updateDoc(doc(db,'retirementRequests',r.id),{status:'approved',reviewedBy:profile.uid,reviewedByName:profile.name||profile.username||'',reviewedAt:serverTimestamp()});
      await addDoc(collection(db,'notifications'),{type:'RETIREMENT_APPROVAL_RESULT',recipientUserId:r.requestedBy,title:'Retirement request approved',message:`Your retirement ${r.action==='delete'?'deletion':'edit'} request was approved by Super Admin.`,read:false,createdAt:serverTimestamp()});
      setConfirm(null);await load();
    }catch(e){setError(e.message)}finally{setSaving(false)}
  };
  const reject=async r=>{
    setSaving(true);setError('');
    try{
      await updateDoc(doc(db,'retirementRequests',r.id),{status:'rejected',reviewedBy:profile.uid,reviewedByName:profile.name||profile.username||'',reviewedAt:serverTimestamp()});
      await addDoc(collection(db,'notifications'),{type:'RETIREMENT_APPROVAL_RESULT',recipientUserId:r.requestedBy,title:'Retirement request rejected',message:`Your retirement ${r.action==='delete'?'deletion':'edit'} request was rejected by Super Admin.`,read:false,createdAt:serverTimestamp()});
      setConfirm(null);await load();
    }catch(e){setError(e.message)}finally{setSaving(false)}
  };

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>[x.branchName,x.assetCode,x.serialNo,x.itemProduct,x.defectiveNote,x.datePurchase,x.dateRetired,x.receivedBy,x.receivedDate].join(' ').toLowerCase().includes(q))},[items,search]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,totalPages);const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>{setPage(1)},[search]);

  return <>
    <div className="page-title-row"><div><span className="eyebrow">ASSET MANAGEMENT</span><h1>Retirement</h1><p>Record and monitor retired assets for all authorized branch users.</p></div><div className="page-actions no-print"><button className="outline-btn" onClick={reset}>Clear</button><button className="amber-btn" onClick={()=>window.print()}>🖨 Print</button></div></div>
    {error&&<div className="error no-print">{error}</div>}
    {saved&&<div className="success no-print">{editing?'Edit request sent to Super Admin for approval.':'Retirement record saved successfully.'}</div>}

    {profile.role==='super_admin'&&<div className="content-card no-print" style={{marginBottom:16}}>
      <div className="panel-heading"><div><h2>🔔 Retirement Approval Requests {requests.length>0&&<span className="retired-pill">{requests.length} pending</span>}</h2><span className="muted">Admin and Employee changes cannot affect retirement records until you approve them.</span></div></div>
      {requests.length===0?<div className="empty-state">No pending retirement approval requests.</div>:<div className="approval-list">{requests.map(r=><div className="approval-item" key={r.id}><div><b>Edit Retirement</b><div>{r.requestedByName} ({roleName(r.requestedByRole)}) · {r.requestedData?.assetCode||r.requestedData?.itemProduct||r.retirementId}</div><small>{r.requestedData?.branchName||'—'}</small></div><div className="actions"><button className="link-btn" disabled={saving} onClick={()=>setConfirm({type:'approve',request:r})}>Approve</button><button className="link-btn danger-link" disabled={saving} onClick={()=>setConfirm({type:'reject',request:r})}>Reject</button></div></div>)}</div>}
    </div>}

    <form className="content-card retirement-form no-print" onSubmit={save}>
      <div className="panel-heading"><div><h2>{editing?'Edit Retirement Record':'Add Retirement Record'}</h2><span className="muted">{editing&&profile.role!=='super_admin'?'Your edit will be sent to Super Admin for approval.':'All fields are stored in Firebase and scoped to the user group.'}</span></div></div>
      <div className="retirement-grid">
        <label className="field span-2"><span>Branch Name</span><select value={form.branchId} onChange={e=>selectBranch(e.target.value)} required><option value="">Select branch...</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></label>
        <label className="field"><span>Asset Code</span><input value={form.assetCode} onChange={e=>change('assetCode',e.target.value)} required placeholder="e.g. AST-0001"/></label>
        <label className="field"><span>Serial No.</span><input value={form.serialNo} onChange={e=>change('serialNo',e.target.value)} placeholder="Serial number"/></label>
        <label className="field span-2"><span>Item Products</span><input value={form.itemProduct} onChange={e=>change('itemProduct',e.target.value)} required placeholder="Item / product name"/></label>
        <label className="field span-2"><span>Defective Note</span><textarea value={form.defectiveNote} onChange={e=>change('defectiveNote',e.target.value)} rows="2" placeholder="Describe the defect, damage, or reason for retirement..."/></label>
        <label className="field"><span>Date Purchase</span><input type="date" value={form.datePurchase} onChange={e=>change('datePurchase',e.target.value)}/></label>
        <label className="field"><span>Date Retired</span><input type="date" value={form.dateRetired} onChange={e=>change('dateRetired',e.target.value)} required/></label>
        <label className="field"><span>Received By</span><input value={form.receivedBy} onChange={e=>change('receivedBy',e.target.value)} placeholder="Name of receiver"/></label>
        <label className="field"><span>Received Date</span><input type="date" value={form.receivedDate} onChange={e=>change('receivedDate',e.target.value)}/></label>
      </div>
      <div className="retirement-actions"><button type="button" className="outline-btn" onClick={reset}>Cancel</button><button className="amber-btn" disabled={saving}>{saving?'Saving...':editing?(profile.role==='super_admin'?'Update Record':'Send for Approval'):'Save Retirement'}</button></div>
    </form>

    <div className="toolbar-row no-print"><div className="search-wrap"><span>⌕</span><input placeholder="Search branch, asset code, serial no., product..." value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span></div>
    <div className="content-card table-wrap retirement-table">
      <table><thead><tr><th>BRANCH NAME</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>ITEM PRODUCTS</th><th>DEFECTIVE NOTE</th><th>DATE PURCHASE</th><th>DATE RETIRED</th><th>RECEIVED BY</th><th>RECEIVED DATE</th><th>ACTION</th></tr></thead>
      <tbody>{loading?<tr><td colSpan="10" className="empty-state">Loading...</td></tr>:shown.length?shown.map(x=><tr key={x.id}><td><b>{val(x.branchName)||'—'}</b></td><td><span className="retired-pill">{val(x.assetCode)||'—'}</span></td><td>{val(x.serialNo)||'—'}</td><td>{val(x.itemProduct)||'—'}</td><td className="retirement-note">{val(x.defectiveNote)||'—'}</td><td>{val(x.datePurchase)||'—'}</td><td>{val(x.dateRetired)||'—'}</td><td>{val(x.receivedBy)||'—'}</td><td>{val(x.receivedDate)||'—'}</td><td><div className="actions"><button className="link-btn" onClick={()=>edit(x)}>Edit</button></div></td></tr>):<tr><td colSpan="10" className="empty-state">No retirement records found.</td></tr>}</tbody></table>
      {!loading&&filtered.length>0&&<div className="table-pagination no-print"><span>Showing {(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button className="ghost-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><b> Page {safePage} of {totalPages} </b><button className="ghost-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button></div></div>}
    </div>

    {confirm&&<div className="branch-modal" role="dialog" aria-modal="true"><div className="content-card" style={{maxWidth:520,margin:'10vh auto'}}><h2>{confirm.type==='approve'?'Confirm approval':'Reject approval request?'}</h2><p>{confirm.type==='approve'?`Allow ${confirm.request.requestedByName} (${roleName(confirm.request.requestedByRole)}) to EDIT retirement ${confirm.request.requestedData?.assetCode||confirm.request.requestedData?.itemProduct||confirm.request.retirementId}? This confirmation will apply the requested change.`:`Reject edit request from ${confirm.request.requestedByName}?`}</p><div className="retirement-actions"><button className="outline-btn" onClick={()=>setConfirm(null)}>Cancel</button>{confirm.type==='approve'?<button className="amber-btn" disabled={saving} onClick={()=>approve(confirm.request)}>{saving?'Processing...':'Yes, Approve'}</button>:<button className="danger-btn" disabled={saving} onClick={()=>reject(confirm.request)}>{saving?'Processing...':'Reject'}</button>}</div></div></div>}
  </>;
}
