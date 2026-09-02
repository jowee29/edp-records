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
  const [branches,setBranches]=useState([]), [groups,setGroups]=useState([]), [leaders,setLeaders]=useState([]), [form,setForm]=useState(blank), [saving,setSaving]=useState(false), [loading,setLoading]=useState(true), [error,setError]=useState(''), [saved,setSaved]=useState(false), [recent,setRecent]=useState([]);
  useEffect(()=>{if(!profile)return;(async()=>{try{const bq=profile.role==='super_admin'?query(collection(db,'branches'),orderBy('createdAt','desc')):query(collection(db,'branches'),where('groupId','==',profile.groupId||'unassigned'));const snap=await getDocs(bq);setBranches(snap.docs.map(d=>({id:d.id,...d.data()})));const g=await getDocs(query(collection(db,'groups'),orderBy('name','asc')));setGroups(g.docs.map(d=>({id:d.id,...d.data()})));const u=await getDocs(query(collection(db,'users'),where('position','==','Team Leader')));setLeaders(u.docs.map(d=>({id:d.id,...d.data()})).filter(x=>String(x.position||x.role||'').toLowerCase().replace(/[_-]/g,' ').includes('team leader')&&x.active!==false));const aq=profile.role==='super_admin'?query(collection(db,'accomplishments'),orderBy('createdAt','desc')):query(collection(db,'accomplishments'),where('groupId','==',profile.groupId||'unassigned'));const a=await getDocs(aq);const recentItems=a.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0));setRecent(recentItems.slice(0,8));}catch(e){setError(e.message)}finally{setLoading(false)}})()},[profile]);
  const branch=useMemo(()=>branches.find(b=>b.id===form.branchId),[branches,form.branchId]);
  const groupedBranches=useMemo(()=>{const map=new Map(groups.map(g=>[g.id,g.name]));const grouped={};branches.forEach(b=>{const key=b.groupId||'unassigned';const name=map.get(key)||b.groupName||'Unassigned';(grouped[name]??=[]).push(b)});return Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([name,list])=>({name,list:list.sort((a,b)=>String(a.branchName||'').localeCompare(String(b.branchName||'')))}));},[branches,groups]);
  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const save=async(e)=>{e?.preventDefault();if(!form.branchId||!form.date||!form.findings.trim()){setError('Piliin ang branch, ilagay ang date, at ilagay ang findings/work done.');return}setSaving(true);setError('');setSaved(false);try{const payload={...form,groupId:profile?.groupId||branch?.groupId||'',createdBy:profile?.uid||'',branchName:branch?.branchName||form.branchVisited,branchSnapshot:branch?{branchName:branch.branchName,branchType:branch.branchType,company:branch.company,accountNo:branch.accountNo,telNo:branch.telNo,contactPerson:branch.contactPerson,contactNo:branch.contactNo,address:branch.address,oic:branch.oic,contactNo1:branch.contactNo1,isp:branch.isp,connType:branch.connType,plan:branch.plan,monthlyPayment:branch.monthlyPayment,ipAddress:branch.ipAddress,subnetMask:branch.subnetMask,defaultGateway:branch.defaultGateway,dns1:branch.dns1,dns2:branch.dns2,noOfComp:branch.noOfComp,printer2175:branch.printer2175,lx310ii:branch.lx310ii,colored:branch.colored}:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};const ref=await addDoc(collection(db,'accomplishments'),payload);await audit({action:'CREATE_ACCOMPLISHMENT',details:`Created branch visit accomplishment for ${payload.branchName}`,targetUserId:ref.id});setSaved(true);setRecent(r=>[{id:ref.id,...payload},...r].slice(0,8));}catch(e){setError(e.message)}finally{setSaving(false)}};
  const reset=()=>{setForm(blank);setError('');setSaved(false)};
  return <>
    <div className="page-title-row"><div><span className="eyebrow">FIELD SERVICE DOCUMENT</span><h1>Add Accomplishment Form</h1><p>EDP Branch Visit Accomplishment.</p></div></div>
    <div className="accomplishment-toolbar no-print"><div><b>EDP Branch Visit Accomplishment</b><span> Letter portrait layout.</span></div>{saved&&<span className="success-pill">✓ Saved to Firebase</span>}</div>
    {error&&<div className="error no-print">{error}</div>}
    <form className="letter-accomplishment-paper" onSubmit={save}>
      <div className="lav-header premium-accomplishment-header">
        <div className="lav-brand-row">
          <div className="lav-brand">
            <img src={edpLogo} className="lav-logo" alt="EDP Logo" />
            <div><strong>EDP RECORDS</strong><small>FIELD SERVICE MANAGEMENT</small></div>
          </div>
          <div className="lav-header-fields no-print">
            <label>DATE<input type="date" value={form.date} onChange={e=>change('date',e.target.value)} required /></label>
            <label>BRANCH<select value={form.branchId} onChange={e=>{const b=branches.find(x=>x.id===e.target.value);change('branchId',e.target.value);change('branchVisited',b?.branchName||'')}} required>
              <option value="">Select branch by group...</option>
              {groupedBranches.map(g=><optgroup key={g.name} label={g.name}>{g.list.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</optgroup>)}
            </select></label>
          </div>
          <div className="lav-header-fields print-only">
            <div><span>DATE</span><b>{fmtDate(form.date) || '____________'}</b></div>
            <div><span>BRANCH</span><b>{branch?.branchName || form.branchVisited || '________________'}</b></div>
          </div>
        </div>
        <div className="lav-form-title"><span>BRANCH VISIT</span><h2>ACCOMPLISHMENT FORM</h2><p>Branch visit documentation • Letter printable record</p></div>
      </div>
      <div className="lav-personnel lav-personnel-premium">
        <label>TEAM LEADER:<input value={form.teamLeader} onChange={e=>change('teamLeader',e.target.value)} placeholder="Enter team leader name" /></label>
        <label>HMS STAFF:<input value={form.hmsStaff} onChange={e=>change('hmsStaff',e.target.value)} placeholder="Enter HMS staff name(s)" /></label>
      </div>

      <div className="lav-section">
        <div className="lav-section-title">FINDINGS / WORK DONE:</div>
        <textarea className="lav-findings" value={form.findings} onChange={e=>change('findings',e.target.value)} required />
      </div>
      <div className="lav-section">
        <div className="lav-section-title">CONSUMABLE ITEM USED:</div>
        <textarea className="lav-consumables" value={form.consumables} onChange={e=>change('consumables',e.target.value)} />
      </div>

      <div className="lav-inventory-title">Branch Inventory &amp; Connectivity Information:</div>
      <div className="lav-grid-head"><div>Branch Details</div><div>Fixed Assets Inventory</div></div>
      <div className="lav-grid-body">
        <div>{branch?<><Row l="Branch Manager:" v={branch.oic}/><Row l="Manager's Contact Number:" v={branch.contactNo1}/><Row l="Branch Contact Person:" v={branch.contactPerson}/><Row l="Branch Contact Number:" v={branch.contactNo}/></>:<><Row l="Branch Manager:" v=""/><Row l="Manager's Contact Number:" v=""/><Row l="Branch Contact Person:" v=""/><Row l="Branch Contact Number:" v=""/></>}</div>
        <div>{branch?<><Row l="Number of Laptops/CPUs:" v={branch.noOfComp}/><Row l="Colored Printers:" v={branch.colored}/><Row l="Epson FX-2175/II:" v={branch.printer2175}/><Row l="Epson LX-310:" v={branch.lx310ii}/></>:<><Row l="Number of Laptops/CPUs:" v=""/><Row l="Colored Printers:" v=""/><Row l="Epson FX-2175/II:" v=""/><Row l="Epson LX-310:" v=""/></>}</div>
      </div>
      <div className="lav-grid-head"><div>ADDRESS</div><div>Network Connectivity</div></div>
      <div className="lav-grid-body lav-lower">
        <div className="lav-address">{val(branch?.address)}</div>
        <div className="lav-network">{branch?<><Row l="Internet Service Provider (ISP):" v={branch.isp}/><div className="lav-pair"><Row l="Accnt#" v={branch.accountNo}/><Row l="IP:" v={branch.ipAddress}/></div><div className="lav-pair"><Row l="Tel#" v={branch.telNo}/><Row l="Mbps" v={branch.plan}/></div></>:<><Row l="Internet Service Provider (ISP):" v=""/><div className="lav-pair"><Row l="Accnt#" v=""/><Row l="IP:" v=""/></div><div className="lav-pair"><Row l="Tel#" v=""/><Row l="Mbps" v=""/></div></>}</div>
      </div>

      <div className="lav-confirm">
        <div className="lav-sign"><label>CONFIRMED BY HMS TEAM LEADER<select value={form.confirmedBy} onChange={e=>change('confirmedBy',e.target.value)}><option value="">Select Team Leader...</option>{leaders.map(u=><option key={u.id} value={u.displayName||u.name||u.fullName||u.email}>{u.displayName||u.name||u.fullName||u.email}</option>)}</select></label><div className="lav-sign-line"></div><small>Signature over Printed Name</small></div>
        <div className="lav-sign"><label>BRANCH REPRESENTATIVE<input value={form.branchRepresentative} onChange={e=>change('branchRepresentative',e.target.value)} /></label><div className="lav-sign-line"></div><small>Signature over Printed Name</small></div>
      </div>
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
