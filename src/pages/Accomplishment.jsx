import edpLogo from '../assets/edp-logo.png';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { audit } from '../auth';

const blank = { branchId:'', branchVisited:'', date:new Date().toISOString().slice(0,10), teamLeader:'', hmsStaff:'', findings:'', consumables:'', remark:'', confirmedBy:'', branchRepresentative:'' };
const val = (v) => v === null || v === undefined || v === '' ? '' : String(v);
const fmtDate = (d) => { if(!d) return ''; const [y,m,day]=String(d).split('-'); return y&&m&&day ? `${m}/${day}/${y}` : String(d); };

export default function Accomplishment(){
  const { profile } = useAuth();
  const [branches,setBranches]=useState([]), [leaders,setLeaders]=useState([]), [form,setForm]=useState(blank), [saving,setSaving]=useState(false), [loading,setLoading]=useState(true), [error,setError]=useState(''), [saved,setSaved]=useState(false), [recent,setRecent]=useState([]);
  useEffect(()=>{if(!profile)return;(async()=>{try{const bq=profile.role==='super_admin'?query(collection(db,'branches'),orderBy('createdAt','desc')):query(collection(db,'branches'),where('groupId','==',profile.groupId||'unassigned'));const snap=await getDocs(bq);setBranches(snap.docs.map(d=>({id:d.id,...d.data()})));const u=await getDocs(query(collection(db,'users'),where('position','==','Team Leader')));setLeaders(u.docs.map(d=>({id:d.id,...d.data()})).filter(x=>String(x.position||x.role||'').toLowerCase().replace(/[_-]/g,' ').includes('team leader')&&x.active!==false));const aq=profile.role==='super_admin'?query(collection(db,'accomplishments'),orderBy('createdAt','desc')):query(collection(db,'accomplishments'),where('groupId','==',profile.groupId||'unassigned'));const a=await getDocs(aq);const recentItems=a.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0));setRecent(recentItems.slice(0,8));}catch(e){setError(e.message)}finally{setLoading(false)}})()},[profile]);
  const branch=useMemo(()=>branches.find(b=>b.id===form.branchId),[branches,form.branchId]);
  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const save=async(e)=>{e?.preventDefault();if(!form.branchId||!form.date||!form.findings.trim()){setError('Piliin ang branch, ilagay ang date, at ilagay ang findings/work done.');return}setSaving(true);setError('');setSaved(false);try{const payload={...form,groupId:profile?.groupId||branch?.groupId||'',createdBy:profile?.uid||'',branchName:branch?.branchName||form.branchVisited,branchSnapshot:branch?{branchName:branch.branchName,branchType:branch.branchType,company:branch.company,accountNo:branch.accountNo,telNo:branch.telNo,contactPerson:branch.contactPerson,contactNo:branch.contactNo,address:branch.address,oic:branch.oic,contactNo1:branch.contactNo1,isp:branch.isp,connType:branch.connType,plan:branch.plan,monthlyPayment:branch.monthlyPayment,ipAddress:branch.ipAddress,subnetMask:branch.subnetMask,defaultGateway:branch.defaultGateway,dns1:branch.dns1,dns2:branch.dns2,noOfComp:branch.noOfComp,printer2175:branch.printer2175,lx310ii:branch.lx310ii,colored:branch.colored}:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};const ref=await addDoc(collection(db,'accomplishments'),payload);await audit({action:'CREATE_ACCOMPLISHMENT',details:`Created branch visit accomplishment for ${payload.branchName}`,targetUserId:ref.id});setSaved(true);setRecent(r=>[{id:ref.id,...payload},...r].slice(0,8));}catch(e){setError(e.message)}finally{setSaving(false)}};
  const reset=()=>{setForm(blank);setError('');setSaved(false)};
  return <>
    <div className="page-title-row"><div><span className="eyebrow">FIELD SERVICE DOCUMENT</span><h1>Add Accomplishment Form</h1><p>Branch Visit Accomplishment Form — Excel template layout.</p></div><div className="page-actions no-print"><button className="outline-btn" type="button" onClick={reset}>Clear</button><button className="amber-btn" type="button" onClick={()=>window.print()}>🖨 Print Form</button></div></div>
    <div className="accomplishment-toolbar no-print"><div><b>Excel-style printable form</b><span> Letter portrait layout matching the supplied Branch Visit template.</span></div>{saved&&<span className="success-pill">✓ Saved to Firebase</span>}</div>
    {error&&<div className="error no-print">{error}</div>}
    <form className="modern-accomplishment-paper" onSubmit={save}>
      <div className="form-cover">
        <div className="cover-brand"><img src={edpLogo} alt="EDP logo" /><div><span>EDP RECORDS</span><small>FIELD SERVICE MANAGEMENT</small></div></div>
        <div className="cover-title"><span>BRANCH VISIT</span><strong>ACCOMPLISHMENT FORM</strong><p>Branch visit documentation • Letter printable record</p></div>
        <div className="cover-meta"><div><span>DATE</span><b>{fmtDate(form.date) || '—'}</b></div><div><span>BRANCH</span><b>{branch?.branchName || 'Select branch'}</b></div></div>
      </div>

      <section className="form-section visit-section">
        <div className="section-heading"><span>01</span><div><b>VISIT INFORMATION</b><small>Basic details of the branch visit and assigned personnel</small></div></div>
        <div className="form-grid four">
          <label className="field span-2"><span>BRANCH VISITED</span><select value={form.branchId} onChange={e=>{change('branchId',e.target.value);change('branchVisited',branches.find(b=>b.id===e.target.value)?.branchName||'')}} required><option value="">Select branch...</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></label>
          <label className="field"><span>DATE</span><input type="date" value={form.date} onChange={e=>change('date',e.target.value)} required/></label>
          <label className="field"><span>TEAM LEADER</span><input value={form.teamLeader} onChange={e=>change('teamLeader',e.target.value)} /></label>
          <label className="field span-2"><span>HMS STAFF</span><input value={form.hmsStaff} onChange={e=>change('hmsStaff',e.target.value)} /></label>
        </div>
      </section>

      <section className="form-section narrative-section">
        <div className="section-heading"><span>02</span><div><b>WORK REPORT</b><small>Document the work performed, consumables and remarks</small></div></div>
        <label className="field"><span>FINDINGS / WORK DONE <em>*</em></span><textarea className="report-area" value={form.findings} onChange={e=>change('findings',e.target.value)} required placeholder="Enter findings, work performed, issues encountered and actions taken..." /></label>
        <div className="form-grid two">
          <label className="field"><span>CONSUMABLE ITEM USED</span><textarea value={form.consumables} onChange={e=>change('consumables',e.target.value)} placeholder="List consumables used..." /></label>
          <label className="field"><span>REMARK</span><textarea value={form.remark} onChange={e=>change('remark',e.target.value)} placeholder="Additional remarks..." /></label>
        </div>
      </section>

      {branch && <section className="form-section reference-section">
        <div className="section-heading"><span>03</span><div><b>BRANCH REFERENCE & INVENTORY</b><small>Complete branch information captured from Branch Management</small></div></div>
        <div className="info-block"><h3>BRANCH PROFILE</h3><div className="info-grid four">
          <Info label="Branch Name" v={branch.branchName}/><Info label="Branch Type" v={branch.branchType}/><Info label="Company" v={branch.company}/><Info label="Account No." v={branch.accountNo}/>
          <Info label="Telephone No." v={branch.telNo}/><Info label="Contact Person" v={branch.contactPerson}/><Info label="Contact No." v={branch.contactNo}/><Info label="Address" v={branch.address} wide/>
          <Info label="OIC / Branch Manager" v={branch.oic}/><Info label="OIC Contact No." v={branch.contactNo1}/>
        </div></div>
        <div className="info-block"><h3>CONNECTIVITY</h3><div className="info-grid four">
          <Info label="ISP" v={branch.isp}/><Info label="Connection Type" v={branch.connType}/><Info label="Plan" v={branch.plan}/><Info label="Monthly Payment" v={branch.monthlyPayment}/>
          <Info label="IP Address" v={branch.ipAddress}/><Info label="Subnet Mask" v={branch.subnetMask}/><Info label="Default Gateway" v={branch.defaultGateway}/><Info label="DNS 1" v={branch.dns1}/><Info label="DNS 2" v={branch.dns2}/>
        </div></div>
        <div className="info-block"><h3>FIXED ASSETS</h3><div className="info-grid four">
          <Info label="No. of Computers" v={branch.noOfComp}/><Info label="2175 / 2175II" v={branch.printer2175}/><Info label="LX-310II" v={branch.lx310ii}/><Info label="Colored" v={branch.colored}/>
        </div></div>
      </section>}

      <section className="form-section approval-section">
        <div className="section-heading"><span>04</span><div><b>CONFIRMATION</b><small>Sign-off by the HMS Team Leader and Branch Representative</small></div></div>
        <div className="signature-grid">
          <div className="signature-card"><label className="field"><span>CONFIRMED BY HMS TEAM LEADER</span><select value={form.confirmedBy} onChange={e=>change('confirmedBy',e.target.value)}><option value="">Select Team Leader...</option>{leaders.map(u=><option key={u.id} value={u.displayName||u.name||u.fullName||u.email}>{u.displayName||u.name||u.fullName||u.email}</option>)}</select></label><div className="signature-line"></div><small>Signature over Printed Name</small></div>
          <div className="signature-card"><label className="field"><span>BRANCH REPRESENTATIVE</span><input value={form.branchRepresentative} onChange={e=>change('branchRepresentative',e.target.value)} /></label><div className="signature-line"></div><small>Signature over Printed Name</small></div>
        </div>
      </section>
      <div className="modern-form-footer"><span>EMER CP#0917-806-5593</span><span>PATRICK/JOEY CP#0917-834-5296</span><b>EDP • BRANCH VISIT RECORD</b></div>
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
function Info({label,v,wide}){return <div className={`info-item${wide?' info-wide':''}`}><span>{label}</span><strong>{val(v)||'—'}</strong></div>}
function Row({l,v}){return <div className="excel-row"><span>{l}</span><strong>{val(v)}</strong></div>}
