import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';

const blank={branchId:'',branchName:'',assetCode:'',serialNo:'',itemProduct:'',defectiveNote:'',datePurchase:'',dateRetired:'',receivedBy:'',receivedDate:''};
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);

export default function Retirement(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]),[items,setItems]=useState([]),[form,setForm]=useState({...blank});
  const [editing,setEditing]=useState(null),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);

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
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selectBranch=id=>{const b=branches.find(x=>x.id===id);setForm(f=>({...f,branchId:id,branchName:b?.branchName||''}))};
  const reset=()=>{setForm({...blank});setEditing(null);setSaved(false);setError('')};
  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');setSaved(false);
    try{
      const payload={...form,groupId:profile.groupId||'unassigned',updatedAt:serverTimestamp()};
      if(editing){await updateDoc(doc(db,'retirements',editing),payload);await audit({action:'UPDATE_RETIREMENT',details:`Updated retirement record for ${form.assetCode||form.itemProduct}`,targetUserId:editing})}
      else {payload.createdBy=profile.uid;payload.createdByName=profile.name||profile.username||'';payload.createdAt=serverTimestamp();const ref=await addDoc(collection(db,'retirements'),payload);await audit({action:'CREATE_RETIREMENT',details:`Created retirement record for ${form.assetCode||form.itemProduct}`,targetUserId:ref.id})}
      await load();setSaved(true);reset();setSaved(true);
    }catch(e){setError(e.message)}finally{setSaving(false)}
  };
  const edit=x=>{setEditing(x.id);setForm({...blank,...x});window.scrollTo({top:0,behavior:'smooth'})};
  const remove=async x=>{if(!confirm(`Delete retirement record for ${x.assetCode||x.itemProduct||'this item'}?`))return;try{await deleteDoc(doc(db,'retirements',x.id));await audit({action:'DELETE_RETIREMENT',details:`Deleted retirement record for ${x.assetCode||x.itemProduct}`,targetUserId:x.id});await load()}catch(e){setError(e.message)}};
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>[x.branchName,x.assetCode,x.serialNo,x.itemProduct,x.defectiveNote,x.datePurchase,x.dateRetired,x.receivedBy,x.receivedDate].join(' ').toLowerCase().includes(q))},[items,search]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,totalPages);const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>{setPage(1)},[search]);

  return <>
    <div className="page-title-row"><div><span className="eyebrow">ASSET MANAGEMENT</span><h1>Retirement</h1><p>Record and monitor retired assets for all authorized branch users.</p></div><div className="page-actions no-print"><button className="outline-btn" onClick={reset}>Clear</button><button className="amber-btn" onClick={()=>window.print()}>🖨 Print</button></div></div>
    {error&&<div className="error no-print">{error}</div>}
    {saved&&<div className="success no-print">Retirement record saved successfully.</div>}
    <form className="content-card retirement-form no-print" onSubmit={save}>
      <div className="panel-heading"><div><h2>{editing?'Edit Retirement Record':'Add Retirement Record'}</h2><span className="muted">All fields are stored in Firebase and scoped to the user's branch group.</span></div></div>
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
      <div className="retirement-actions"><button type="button" className="outline-btn" onClick={reset}>Cancel</button><button className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Update Record':'Save Retirement'}</button></div>
    </form>

    <div className="toolbar-row no-print"><div className="search-wrap"><span>⌕</span><input placeholder="Search branch, asset code, serial no., product..." value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span></div>
    <div className="content-card table-wrap retirement-table">
      <table><thead><tr><th>BRANCH NAME</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>ITEM PRODUCTS</th><th>DEFECTIVE NOTE</th><th>DATE PURCHASE</th><th>DATE RETIRED</th><th>RECEIVED BY</th><th>RECEIVED DATE</th><th>ACTION</th></tr></thead>
      <tbody>{loading?<tr><td colSpan="10" className="empty-state">Loading...</td></tr>:shown.length?shown.map(x=><tr key={x.id}><td><b>{val(x.branchName)||'—'}</b></td><td><span className="retired-pill">{val(x.assetCode)||'—'}</span></td><td>{val(x.serialNo)||'—'}</td><td>{val(x.itemProduct)||'—'}</td><td className="retirement-note">{val(x.defectiveNote)||'—'}</td><td>{val(x.datePurchase)||'—'}</td><td>{val(x.dateRetired)||'—'}</td><td>{val(x.receivedBy)||'—'}</td><td>{val(x.receivedDate)||'—'}</td><td><div className="actions"><button className="link-btn" onClick={()=>edit(x)}>Edit</button><button className="link-btn danger-link" onClick={()=>remove(x)}>Delete</button></div></td></tr>):<tr><td colSpan="10" className="empty-state">No retirement records found.</td></tr>}</tbody></table>
      {!loading&&filtered.length>0&&<div className="table-pagination no-print"><span>Showing {(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button className="ghost-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><b> Page {safePage} of {totalPages} </b><button className="ghost-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button></div></div>}
    </div>
  </>;
}
