import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';
import ConfirmModal from '../components/ConfirmModal';
import { usePagination, TablePagination } from '../components/TablePagination';

const blank={unitId:'',unitName:'',modelBrand:'',model:'',brand:'',assetCode:'',serialNo:'',branchId:'',branchName:'',groupId:'',groupName:'',date:''};
const val=x=>x===null||x===undefined?'':String(x);
const dateText=x=>{ if(!x)return '—'; if(typeof x==='string')return x; if(x?.toDate)return x.toDate().toLocaleDateString('en-PH',{year:'numeric',month:'2-digit',day:'2-digit'}); return String(x); };

export default function ServiceUnit(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]),[units,setUnits]=useState([]),[items,setItems]=useState([]);
  const [form,setForm]=useState({...blank}),[editing,setEditing]=useState(null),[modalOpen,setModalOpen]=useState(false),[viewing,setViewing]=useState(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [search,setSearch]=useState(''),[confirm,setConfirm]=useState(null),[confirmSaving,setConfirmSaving]=useState(false);

  const load=async()=>{
    if(!profile)return; setLoading(true);setError('');
    try{
      const groupId=profile.groupId||'unassigned';
      const isSuper=profile.role==='super_admin';
      const branchQ=isSuper?query(collection(db,'branches'),orderBy('branchName','asc')):query(collection(db,'branches'),where('groupId','==',groupId),orderBy('branchName','asc'));
      const itemQ=isSuper?query(collection(db,'serviceUnits'),orderBy('createdAt','desc')):query(collection(db,'serviceUnits'),where('groupId','==',groupId),orderBy('createdAt','desc'));
      const [bs,us,is]=await Promise.all([
        getDocs(branchQ).catch(async()=>getDocs(isSuper?collection(db,'branches'):query(collection(db,'branches'),where('groupId','==',groupId)))),
        getDocs(query(collection(db,'units'),orderBy('name','asc'))).catch(()=>getDocs(collection(db,'units'))),
        getDocs(itemQ).catch(async()=>getDocs(isSuper?collection(db,'serviceUnits'):query(collection(db,'serviceUnits'),where('groupId','==',groupId))))
      ]);
      const branchRows=bs.docs.map(d=>({id:d.id,...d.data()})).filter(b=>isSuper||val(b.groupId)===val(groupId)).sort((a,b)=>val(a.branchName).localeCompare(val(b.branchName)));
      setBranches(branchRows);
      setUnits(us.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>val(a.name).localeCompare(val(b.name))));
      setItems(is.docs.map(d=>({id:d.id,...d.data()})).filter(x=>isSuper||val(x.groupId)===val(groupId)).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    }catch(e){setError(e.message||'Unable to load Service Units.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[profile]);

  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selectBranch=id=>{const b=branches.find(x=>x.id===id);setForm(f=>({...f,branchId:id,branchName:b?.branchName||'',groupId:b?.groupId||profile?.groupId||'unassigned',groupName:b?.groupName||profile?.groupName||''}));};
  const selectUnit=id=>{const u=units.find(x=>x.id===id);setForm(f=>({...f,unitId:id,unitName:u?.name||''}));};
  const reset=()=>{setForm({...blank});setEditing(null);setError('');};
  const openAdd=()=>{reset();setModalOpen(true);document.body.classList.add('modal-open');};
  const openEdit=x=>{setEditing(x.id);setForm({...blank,...x,modelBrand:x.modelBrand||[x.model,x.brand].filter(Boolean).join(' / '),unitId:x.unitId||units.find(u=>val(u.name).toLowerCase()===val(x.unitName).toLowerCase())?.id||'',unitName:x.unitName||''});setError('');setModalOpen(true);document.body.classList.add('modal-open');};
  const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open');};
  const openView=x=>{setViewing(x);document.body.classList.add('modal-open');};
  const closeView=()=>{setViewing(null);document.body.classList.remove('modal-open');};

  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');
    try{
      const b=branches.find(x=>x.id===form.branchId);
      const payload={unitId:form.unitId||'',unitName:form.unitName.trim(),modelBrand:form.modelBrand.trim(),model:form.modelBrand.trim(),brand:'',assetCode:form.assetCode.trim(),serialNo:form.serialNo.trim(),branchId:b?.id||form.branchId,branchName:b?.branchName||form.branchName,groupId:b?.groupId||form.groupId||profile?.groupId||'unassigned',groupName:b?.groupName||form.groupName||profile?.groupName||'',date:form.date,updatedAt:serverTimestamp()};
      if(editing){await updateDoc(doc(db,'serviceUnits',editing),payload);await audit({action:'UPDATE_SERVICE_UNIT',details:`Updated Service Unit ${payload.unitName} / ${payload.assetCode}`});}
      else{await addDoc(collection(db,'serviceUnits'),{...payload,createdAt:serverTimestamp(),createdBy:profile.uid,createdByName:profile.name||profile.username||''});await audit({action:'CREATE_SERVICE_UNIT',details:`Created Service Unit ${payload.unitName} / ${payload.assetCode}`});}
      closeModal();await load();
    }catch(e){setError(e.message||'Unable to save Service Unit.');}finally{setSaving(false);}
  };
  const returnUnit=x=>setConfirm({title:'Return Service Unit',message:`Return ${x.unitName||'this Service Unit'} (${x.assetCode||'no asset code'})? This will clear Issue To and Date.`,confirmLabel:'Return',danger:false,onConfirm:async()=>{setConfirmSaving(true);try{await updateDoc(doc(db,'serviceUnits',x.id),{branchId:'',branchName:'',groupId:x.groupId||profile?.groupId||'unassigned',groupName:x.groupName||profile?.groupName||'',date:'',updatedAt:serverTimestamp()});await audit({action:'RETURN_SERVICE_UNIT',details:`Returned Service Unit ${x.unitName||''} / ${x.assetCode||''}`});setConfirm(null);await load();}catch(e){setError(e.message||'Unable to return Service Unit.');}finally{setConfirmSaving(false);}}});

  const remove=x=>setConfirm({title:'Delete Service Unit',message:`Delete ${x.unitName||'this Service Unit'} (${x.assetCode||'no asset code'})?`,confirmLabel:'Delete',danger:true,onConfirm:async()=>{setConfirmSaving(true);try{await deleteDoc(doc(db,'serviceUnits',x.id));await audit({action:'DELETE_SERVICE_UNIT',details:`Deleted Service Unit ${x.unitName||''} / ${x.assetCode||''}`});setConfirm(null);closeView();await load();}catch(e){setError(e.message||'Unable to delete Service Unit.');}finally{setConfirmSaving(false);}}});

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>[x.unitName,x.modelBrand,x.model,x.brand,x.assetCode,x.serialNo,x.branchName,x.groupName,x.date].join(' ').toLowerCase().includes(q));},[items,search]);
  const {pageItems,page,setPage,totalPages,pageSize}=usePagination(filtered,10);
  useEffect(()=>setPage(1),[search]);

  return <section className="service-unit-page">
    <div className="page-title-row"><div><p className="eyebrow">OPERATIONS</p><h1>Service Unit</h1><p className="subtext">Manage service units assigned to branches within your group.</p></div><button className="amber-btn" type="button" onClick={openAdd}>+ Add New Service Unit</button></div>
    <div className="content-card toolbar-row service-unit-toolbar"><div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search unit, model, brand, asset code, serial, branch..."/></div><span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span></div>
    <div className="content-card table-wrap service-unit-table-card">
      <table><thead><tr><th>UNIT</th><th>MODEL / BRAND</th><th>ASSET CODE</th><th>SERIAL #</th><th>ISSUE TO</th><th>DATE</th><th>STATUS</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={7} className="empty-state">Loading Service Units...</td></tr>:pageItems.length?pageItems.map(x=>{const assigned=Boolean(val(x.branchId)||val(x.branchName));return <tr key={x.id} className="service-unit-row" onClick={()=>openView(x)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')openView(x)}} tabIndex="0" role="button"><td><b>{val(x.unitName)||'—'}</b></td><td>{val(x.modelBrand)||[x.model,x.brand].filter(Boolean).join(' / ')||'—'}</td><td>{val(x.assetCode)||'—'}</td><td>{val(x.serialNo)||'—'}</td><td><b>{val(x.branchName)||'—'}</b>{x.groupName&&<small>{x.groupName}</small>}</td><td>{dateText(x.date)}</td><td><select className="service-unit-status-select" value={assigned?'Not Return':'Return'} disabled={!assigned} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();if(e.target.value==='Return')returnUnit(x);}} aria-label={`Status for ${x.unitName||'Service Unit'}`}><option value="Not Return">Not Return</option><option value="Return">Return</option></select></td></tr>}):<tr><td colSpan={7} className="empty-state">No Service Units found.</td></tr>}</tbody></table>
      {!loading&&filtered.length>0&&<TablePagination page={page} setPage={setPage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize}/>} 
    </div>

    {modalOpen&&<div className="modal-backdrop"><div className="modal service-unit-modal"><div className="modal-header"><div><p className="eyebrow">SERVICE UNIT</p><h2>{editing?'Update Service Unit':'Add New Service Unit'}</h2></div><button className="modal-close" onClick={closeModal}>×</button></div><form onSubmit={save}><div className="modal-body service-unit-form-grid">
      <label><span>Unit</span><select value={form.unitId} onChange={e=>selectUnit(e.target.value)} required><option value="">Select unit...</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="span-2"><span>Model / Brand</span><input value={form.modelBrand} onChange={e=>change('modelBrand',e.target.value)} placeholder="Model / Brand" required/></label>
      <label><span>Asset Code</span><input value={form.assetCode} onChange={e=>change('assetCode',e.target.value)} placeholder="Asset code" required/></label>
      <label><span>Serial #</span><input value={form.serialNo} onChange={e=>change('serialNo',e.target.value)} placeholder="Serial number" required/></label>
      <label className="span-2"><span>Issue To</span><select value={form.branchId} onChange={e=>selectBranch(e.target.value)}><option value="">Not assigned</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}{b.groupName?` — ${b.groupName}`:''}</option>)}</select></label>
      <label><span>Date</span><input type="date" value={form.date} onChange={e=>change('date',e.target.value)}/></label>
    </div>{error&&<p className="error">{error}</p>}<div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeModal}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?(editing?'Updating...':'Adding...'):(editing?'Update':'Add New Service Unit')}</button></div></form></div></div>}

    {viewing&&<div className="modal-backdrop"><div className="modal service-unit-view-modal"><div className="modal-header"><div><p className="eyebrow">SERVICE UNIT RECORD</p><h2>{viewing.unitName||'Service Unit'}</h2><p className="subtext">View complete service unit information.</p></div><button className="modal-close" onClick={closeView}>×</button></div><div className="modal-body"><div className="service-unit-detail-grid"><div><span>UNIT</span><b>{viewing.unitName||'—'}</b></div><div className="span-2"><span>MODEL / BRAND</span><b>{viewing.modelBrand||[viewing.model,viewing.brand].filter(Boolean).join(' / ')||'—'}</b></div><div><span>ASSET CODE</span><b>{viewing.assetCode||'—'}</b></div><div><span>SERIAL #</span><b>{viewing.serialNo||'—'}</b></div><div><span>ISSUE TO</span><b>{viewing.branchName||'—'}</b><small>{viewing.groupName||'—'}</small></div><div><span>DATE</span><b>{dateText(viewing.date)}</b></div></div></div><div className="modal-footer"><button className="ghost-btn" onClick={closeView}>Close</button><button className="table-action edit" onClick={()=>{const x=viewing;closeView();openEdit(x)}}>Edit</button><button className="table-action danger" onClick={()=>remove(viewing)}>Delete</button></div></div></div>}
    <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
  </section>;
}
