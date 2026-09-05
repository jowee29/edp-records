import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';

const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);
const dateText=x=>{
  if(!x)return '—';
  if(typeof x==='string')return x;
  if(x?.toDate)return x.toDate().toLocaleString('en-PH',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  return String(x);
};

export default function JobDone(){
  const {profile}=useAuth();
  const [items,setItems]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [viewing,setViewing]=useState(null),[receivedOpen,setReceivedOpen]=useState(false);
  const [receivedBy,setReceivedBy]=useState(''),[receivedDate,setReceivedDate]=useState(new Date().toISOString().slice(0,16));
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');

  const load=async()=>{
    if(!profile)return;
    setLoading(true);setError('');
    try{
      const groupId=profile.role==='super_admin'?null:(profile.groupId||'unassigned');
      const q=groupId?query(collection(db,'jobDone'),where('groupId','==',groupId),orderBy('repairedAt','desc')):query(collection(db,'jobDone'),orderBy('repairedAt','desc'));
      const snap=await getDocs(q).catch(()=>getDocs(groupId?query(collection(db,'jobDone'),where('groupId','==',groupId)):collection(db,'jobDone')));
      setItems(snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!groupId||x.groupId===groupId).sort((a,b)=>(b.repairedAt?.seconds||b.createdAt?.seconds||0)-(a.repairedAt?.seconds||a.createdAt?.seconds||0)));
    }catch(e){setError(e.message||'Unable to load Job Done records.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const openReceived=x=>{
    setViewing(x);
    setReceivedOpen(true);setError('');
    setReceivedBy(x.receivedBy||profile.name||profile.username||profile.email||'');
    const d=x.receivedDate?.toDate?x.receivedDate.toDate():new Date();
    const pad=n=>String(n).padStart(2,'0');
    setReceivedDate(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    document.body.classList.add('modal-open');
  };
  const closeModals=()=>{setViewing(null);setReceivedOpen(false);document.body.classList.remove('modal-open');};

  const saveReceived=async e=>{
    e.preventDefault();
    if(!viewing)return;
    setSaving(true);setError('');
    try{
      const name=val(receivedBy).trim(), date=val(receivedDate).trim();
      if(!name||!date)throw new Error('Kumpletuhin ang Received By at Date Received.');
      await updateDoc(doc(db,'jobDone',viewing.id),{
        receivedBy:name,receivedDate:date,received:true,updatedAt:serverTimestamp(),receivedByUid:profile.uid||''
      });
      await audit({action:'RECEIVE_JOB_DONE',details:`Received Job Done ${viewing.assetCode||''} / ${viewing.serialNo||''} by ${name} on ${date}`,targetUserId:viewing.id});
      setItems(prev=>prev.map(r=>r.id===viewing.id?{...r,receivedBy:name,receivedDate:date,received:true}:r));
      closeModals();
    }catch(e){setError(e.message||'Unable to update received information.');}
    finally{setSaving(false)}
  };

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return items.filter(x=>!q||[x.branchName,x.assetCode,x.serialNo,x.itemProduct,x.repairedBy,x.receivedBy,x.status,x.notes].join(' ').toLowerCase().includes(q));
  },[items,search]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,totalPages);
  const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>setPage(1),[search]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);

  if(!profile)return null;
  return <>
    <div className="page-title-row">
      <div><span className="eyebrow">FIELD SERVICE</span><h1>Job Done</h1><p className="subtext">Lahat ng Job Order na Repaired ay inililipat dito para sa final receiving.</p></div>
    </div>
    {error&&<div className="error no-print">{error}</div>}
    <div className="toolbar-row no-print">
      <div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search branch, asset code, serial no., item product, received by..."/></div>
      <span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span>
    </div>
    <div className="content-card table-card job-done-card">
      <div className="table-scroll"><table className="data-table job-done-table">
        <thead><tr><th>BRANCH NAME</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>ITEM PRODUCTS</th><th>REPAIRED BY</th><th>DATE REPAIRED</th><th>RECEIVED BY</th><th>DATE RECEIVED</th><th>STATUS</th><th>ACTION</th></tr></thead>
        <tbody>
          {loading?<tr><td colSpan="10" className="empty-state">Loading Job Done...</td></tr>:
          shown.length===0?<tr><td colSpan="10" className="empty-state"><strong>No Job Done records found</strong><p>Kapag may Job Order na Repaired, lalabas ito dito.</p></td></tr>:
          shown.map(x=>{
            const received=Boolean(x.received||x.receivedBy);
            return <tr key={x.id} className="clickable-row" onClick={()=>setViewing(x)}>
              <td data-label="Branch Name"><span className="table-primary">{val(x.branchName)||'—'}</span></td>
              <td data-label="Asset Code" className="mono-cell">{val(x.assetCode)||'—'}</td>
              <td data-label="Serial No." className="mono-cell">{val(x.serialNo)||'—'}</td>
              <td data-label="Item Products">{val(x.itemProduct)||'—'}</td>
              <td data-label="Repaired By">{val(x.repairedBy)||val(x.repairBy)||'—'}</td>
              <td data-label="Date Repaired">{dateText(x.repairedAt)}</td>
              <td data-label="Received By">{received?val(x.receivedBy):'—'}</td>
              <td data-label="Date Received">{received?dateText(x.receivedDate):'—'}</td>
              <td data-label="Status"><span className={`job-status ${received?'status-received':'status-waiting'}`}>{received?'Received':'Waiting to be Received'}</span></td>
              <td data-label="Action" onClick={e=>e.stopPropagation()}><button type="button" className={`receive-btn ${received?'received-done':''}`} disabled={received} onClick={()=>openReceived(x)}>{received?'✓ Received':'Received'}</button></td>
            </tr>
          })}
        </tbody>
      </table></div>
      <div className="job-done-pagination no-print"><div className="job-done-page-info">Showing <b>{filtered.length?((safePage-1)*PAGE_SIZE+1):0}</b>–<b>{Math.min(safePage*PAGE_SIZE,filtered.length)}</b> of <b>{filtered.length}</b> records</div><div className="job-done-page-controls"><button type="button" className="job-done-page-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Prev</button>{Array.from({length:Math.min(totalPages,7)},(_,i)=>{let n;if(totalPages<=7)n=i+1;else if(safePage<=4)n=i+1;else if(safePage>=totalPages-3)n=totalPages-6+i;else n=safePage-3+i;return n;}).map((n,i)=><button type="button" key={`${n}-${i}`} className={`job-done-page-btn ${n===safePage?'active':''}`} onClick={()=>setPage(n)}>{n}</button>)}<button type="button" className="job-done-page-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next ›</button></div></div>
    </div>

    {viewing&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeModals()}}><div className="modal branch-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><p className="eyebrow">JOB DONE</p><h2>View Job Done</h2><p className="subtext">Final receiving information.</p></div><button className="modal-close" onClick={closeModals}>×</button></div>
      <div className="modal-body"><div className="job-order-detail-grid">
        <div><span>BRANCH NAME</span><strong>{val(viewing.branchName)||'—'}</strong></div><div><span>ASSET CODE</span><strong>{val(viewing.assetCode)||'—'}</strong></div>
        <div><span>SERIAL NO.</span><strong>{val(viewing.serialNo)||'—'}</strong></div><div><span>ITEM PRODUCTS</span><strong>{val(viewing.itemProduct)||'—'}</strong></div>
        <div><span>REPAIRED BY</span><strong>{val(viewing.repairedBy)||val(viewing.repairBy)||'—'}</strong></div><div><span>DATE REPAIRED</span><strong>{dateText(viewing.repairedAt)}</strong></div>
        <div><span>RECEIVED BY</span><strong>{val(viewing.receivedBy)||'Not yet received'}</strong></div><div><span>DATE RECEIVED</span><strong>{dateText(viewing.receivedDate)}</strong></div>
      </div></div>
      <div className="modal-footer"><button className="ghost-btn" onClick={closeModals}>Close</button>{!(viewing.received||viewing.receivedBy)&&<button className="amber-btn" onClick={()=>openReceived(viewing)}>Received</button>}</div>
    </div></div>}

    {receivedOpen&&viewing&&<div className="modal-backdrop" role="presentation"><div className="modal branch-modal received-editor-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><p className="eyebrow">FINAL RECEIVING</p><h2>Update Received Information</h2><p className="subtext">I-record kung sino ang tumanggap at kailan natanggap ang repaired asset.</p></div><button className="modal-close" type="button" onClick={closeModals}>×</button></div>
      <form onSubmit={saveReceived}><div className="modal-body"><div className="repair-job-info"><span>JOB DONE</span><strong>{val(viewing.branchName)||'—'} &nbsp;•&nbsp; {val(viewing.assetCode)||'—'} &nbsp;•&nbsp; {val(viewing.serialNo)||'—'}</strong><small>{val(viewing.itemProduct)||'—'}</small></div>
        <div className="parts-form-grid"><label>RECEIVED BY <input value={receivedBy} onChange={e=>setReceivedBy(e.target.value)} placeholder="Name of recipient" required/></label><label>DATE RECEIVED <input type="datetime-local" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)} required/></label></div>
        {error&&<div className="error modal-error">{error}</div>}
      </div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeModals}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Updating...':'Update'}</button></div></form>
    </div></div>}
  </>;
}
