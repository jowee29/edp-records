import edpLogo from '../assets/edp-logo.png';
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { audit } from '../auth';

const blank = { branchId:'', branchVisited:'', date:new Date().toISOString().slice(0,10), teamLeader:'', hmsStaff:'', findings:'', consumables:'', remark:'', confirmedBy:'', branchRepresentative:'' };
const val = (v) => v === null || v === undefined || v === '' ? '' : String(v);
const fmtDate = (d) => { if(!d) return ''; const [y,m,day]=String(d).split('-'); return y&&m&&day ? `${m}/${day}/${y}` : String(d); };

export default function Accomplishment(){
  const [branches,setBranches]=useState([]), [form,setForm]=useState(blank), [saving,setSaving]=useState(false), [loading,setLoading]=useState(true), [error,setError]=useState(''), [saved,setSaved]=useState(false), [recent,setRecent]=useState([]);
  useEffect(()=>{(async()=>{try{const snap=await getDocs(query(collection(db,'branches'),orderBy('createdAt','desc')));setBranches(snap.docs.map(d=>({id:d.id,...d.data()})));const a=await getDocs(query(collection(db,'accomplishments'),orderBy('createdAt','desc')));setRecent(a.docs.slice(0,8).map(d=>({id:d.id,...d.data()})));}catch(e){setError(e.message)}finally{setLoading(false)}})()},[]);
  const branch=useMemo(()=>branches.find(b=>b.id===form.branchId),[branches,form.branchId]);
  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const save=async(e)=>{e?.preventDefault();if(!form.branchId||!form.date||!form.findings.trim()){setError('Piliin ang branch, ilagay ang date, at ilagay ang findings/work done.');return}setSaving(true);setError('');setSaved(false);try{const payload={...form,branchName:branch?.branchName||form.branchVisited,branchSnapshot:branch?{branchName:branch.branchName,branchType:branch.branchType,company:branch.company,accountNo:branch.accountNo,telNo:branch.telNo,contactPerson:branch.contactPerson,contactNo:branch.contactNo,address:branch.address,oic:branch.oic,contactNo1:branch.contactNo1,isp:branch.isp,connType:branch.connType,plan:branch.plan,monthlyPayment:branch.monthlyPayment,ipAddress:branch.ipAddress,subnetMask:branch.subnetMask,defaultGateway:branch.defaultGateway,dns1:branch.dns1,dns2:branch.dns2,noOfComp:branch.noOfComp,printer2175:branch.printer2175,lx310ii:branch.lx310ii,colored:branch.colored}:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};const ref=await addDoc(collection(db,'accomplishments'),payload);await audit({action:'CREATE_ACCOMPLISHMENT',details:`Created branch visit accomplishment for ${payload.branchName}`,targetUserId:ref.id});setSaved(true);setRecent(r=>[{id:ref.id,...payload},...r].slice(0,8));}catch(e){setError(e.message)}finally{setSaving(false)}};
  const reset=()=>{setForm(blank);setError('');setSaved(false)};
  return <>
    <div className="page-title-row"><div><span className="eyebrow">FIELD SERVICE DOCUMENT</span><h1>Add Accomplishment Form</h1><p>Branch Visit Accomplishment Form — Excel template layout.</p></div><div className="page-actions no-print"><button className="outline-btn" type="button" onClick={reset}>Clear</button><button className="amber-btn" type="button" onClick={()=>window.print()}>🖨 Print Form</button></div></div>
    <div className="accomplishment-toolbar no-print"><div><b>Excel-style printable form</b><span> A4 portrait layout matching the supplied Branch Visit template.</span></div>{saved&&<span className="success-pill">✓ Saved to Firebase</span>}</div>
    {error&&<div className="error no-print">{error}</div>}
    <form className="excel-paper" onSubmit={save}>
      <div className="excel-header"><img className="excel-form-logo" src={edpLogo} alt="EDP logo" /><div className="excel-title">BRANCH VISIT ACCOMPLISHMENT FORM</div></div>
      <div className="excel-meta">
        <div className="meta-label">BRANCH VISITED:</div><div className="meta-field branch-field"><select value={form.branchId} onChange={e=>{change('branchId',e.target.value);change('branchVisited',branches.find(b=>b.id===e.target.value)?.branchName||'')}} required><option value="">Select branch...</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></div>
        <div className="meta-label date-label">DATE:</div><div className="meta-field"><input type="date" value={form.date} onChange={e=>change('date',e.target.value)} required/></div>
        <div className="meta-label">TEAM LEADER:</div><div className="meta-field meta-wide"><input value={form.teamLeader} onChange={e=>change('teamLeader',e.target.value)}/></div>
        <div className="meta-label">HMS STAFF:</div><div className="meta-field meta-wide"><input value={form.hmsStaff} onChange={e=>change('hmsStaff',e.target.value)}/></div>
      </div>
      <div className="excel-section-label">FINDINGS/WORK DONE:</div>
      <textarea className="excel-large-area" value={form.findings} onChange={e=>change('findings',e.target.value)} required />
      <div className="excel-section-label">CONSUMABLE ITEM USED:</div>
      <textarea className="excel-consumable" value={form.consumables} onChange={e=>change('consumables',e.target.value)} />
      <div className="excel-section-label">REMARK:</div>
      <textarea className="excel-remark" value={form.remark} onChange={e=>change('remark',e.target.value)} />
      {branch && <Inventory branch={branch}/>} 
      <div className="excel-signatures">
        <div><div className="sig-title">Confirmed by HMS Team Leader</div><input value={form.confirmedBy} onChange={e=>change('confirmedBy',e.target.value)}/><div className="sig-line"></div><div className="sig-caption">Signature over Printed Name</div></div>
        <div><div className="sig-title">Branch Representative</div><input value={form.branchRepresentative} onChange={e=>change('branchRepresentative',e.target.value)}/><div className="sig-line"></div><div className="sig-caption">Signature over Printed Name</div></div>
      </div>
      <div className="excel-footer"><span>EMER CP#0917-806-5593</span><span>PATRICK/JOEY CP#0917-834-5296</span></div>
      <div className="paper-save-actions no-print"><button type="button" className="outline-btn" onClick={reset}>Clear</button><button type="submit" className="amber-btn" disabled={saving||loading}>{saving?'Saving...':'Save Accomplishment'}</button><button type="button" className="outline-btn" onClick={()=>window.print()}>🖨 Print</button></div>
    </form>
    <div className="recent-accomplishments no-print"><div className="page-title-row"><div><span className="eyebrow">HISTORY</span><h2>Recent Accomplishments</h2></div></div><div className="content-card table-wrap"><table><thead><tr><th>DATE</th><th>BRANCH</th><th>TEAM LEADER</th><th>HMS STAFF</th><th>CREATED</th></tr></thead><tbody>{recent.length?recent.map(r=><tr key={r.id}><td>{r.date||'—'}</td><td><b>{r.branchName||r.branchVisited||'—'}</b></td><td>{r.teamLeader||'—'}</td><td>{r.hmsStaff||'—'}</td><td>{r.createdAt?.toDate?r.createdAt.toDate().toLocaleString():'Saved'}</td></tr>):<tr><td colSpan="5" className="empty-state">No saved accomplishment forms yet.</td></tr>}</tbody></table></div></div>
  </>;
}

function Inventory({branch}){const s=branch||{};return <div className="excel-inventory">
  <div className="inventory-main-title">🖥️Branch Inventory &amp; Connectivity Information:</div>
  <div className="inventory-grid-head"><div>🧑‍💼 Branch Details</div><div>💻 Fixed Assets Inventory</div></div>
  <div className="inventory-grid-body">
    <div className="inventory-left"><Row l="Branch Manager:" v={s.oic}/><Row l="Manager's Contact Number:" v={s.contactNo1}/><Row l="Branch Contact Person:" v={s.contactPerson}/><Row l="Branch Contact Number:" v={s.contactNo}/></div>
    <div className="inventory-right"><Row l="Number of Laptops/CPUs:" v={s.noOfComp}/><Row l="Colored Printers:" v={s.colored}/><Row l="Epson FX-2175/II:" v={s.printer2175}/><Row l="Epson LX-310:" v={s.lx310ii}/></div>
  </div>
  <div className="inventory-grid-head lower"><div>📌ADDRESS</div><div>🌐 Network Connectivity</div></div>
  <div className="inventory-grid-body lower-body">
    <div className="address-cell">{val(s.address)}</div>
    <div className="network-cell"><Row l="Internet Service Provider (ISP):" v={s.isp}/><div className="network-pair"><Row l="Accnt#" v={s.accountNo}/><Row l="IP:" v={s.ipAddress||s.connType}/></div><div className="network-pair"><Row l="Tel#" v={s.telNo}/><Row l="Mbps" v={s.plan}/></div></div>
  </div>
</div>}
function Row({l,v}){return <div className="excel-row"><span>{l}</span><strong>{val(v)}</strong></div>}
