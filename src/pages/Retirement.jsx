import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';
import ConfirmModal from '../components/ConfirmModal';

const blank={branchId:'',branchName:'',assetCode:'',serialNo:'',unitId:'',unitName:'',itemProduct:'',defectiveNote:'',datePurchase:'',dateRetired:'',receivedBy:'',receivedDate:'',status:'Not Replaced'};
const REPLACED='Replaced';
const NOT_REPLACED='Not Replaced';
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);

export default function Retirement(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]),[units,setUnits]=useState([]),[items,setItems]=useState([]),[form,setForm]=useState({...blank});
  const [confirm,setConfirm]=useState(null),[confirmSaving,setConfirmSaving]=useState(false);
  const [editing,setEditing]=useState(null),[modalOpen,setModalOpen]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [showImport,setShowImport]=useState(false),[importRows,setImportRows]=useState([]),[importFile,setImportFile]=useState(null),[importing,setImporting]=useState(false),[importError,setImportError]=useState('');

  const normalizeKey=x=>String(x??'').trim().toUpperCase().replace(/[._\-/]+/g,' ').replace(/\s+/g,' ');

  const load=async()=>{
    if(!profile)return; setLoading(true); setError('');
    try{
      const isSuper=profile.role==='super_admin';
      const isAdmin=profile.role==='admin';
      const groupId=profile.groupId||'unassigned';

      // Admin and Super Admin can work across ALL branches. Employees remain group-scoped.
      const bcol=collection(db,'branches');
      let bq=(isSuper||isAdmin)
        ? query(bcol,orderBy('branchName','asc'))
        : query(bcol,where('groupId','==',groupId),orderBy('branchName','asc'));
      let snap;
      try{snap=await getDocs(bq)}catch(e){
        snap=await getDocs(bcol);
        if(!isSuper&&!isAdmin) snap={docs:snap.docs.filter(d=>(d.data()?.groupId||'unassigned')===groupId)};
      }
      const branchData=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.branchName||'').localeCompare(String(b.branchName||'')));
      setBranches(branchData);

      // Units are managed by Super Admin in the Units menu, but the unit list is
      // readable here by staff so the Retirement form can stay dynamic.
      const unitSnap=await getDocs(query(collection(db,'units'),orderBy('name','asc')));
      setUnits(unitSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))));

      // Retirement access is enforced from the user's GROUP -> BRANCH membership.
      // This is intentionally stricter than trusting retirements.groupId because older
      // records may have a missing/incorrect groupId. Regular users can only see records
      // whose branch belongs to their assigned group.
      const branchList=snap.docs.map(d=>({id:d.id,...d.data()}));
      const allowedBranchIds=new Set(branchList.map(b=>b.id));
      const allowedBranchNames=new Set(branchList.map(b=>normalizeKey(b.branchName)));

      const rcol=collection(db,'retirements');
      let retirementSnap;
      if(isSuper||isAdmin){
        retirementSnap=await getDocs(query(rcol,orderBy('createdAt','desc')));
      }else{
        try{
          retirementSnap=await getDocs(query(rcol,where('groupId','==',groupId),orderBy('createdAt','desc')));
        }catch(e){
          retirementSnap=await getDocs(rcol);
        }
      }
      const retirementList=retirementSnap.docs.map(d=>({id:d.id,...d.data()}));
      const visibleRetirements=(isSuper||isAdmin)
        ? retirementList
        : retirementList.filter(r=>{
            // Primary check: the retirement's branch must be one of this group's branches.
            if(r.branchId) return allowedBranchIds.has(r.branchId);
            // Legacy fallback for records without branchId.
            return allowedBranchNames.has(normalizeKey(r.branchName));
          });
      setItems(visibleRetirements.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const unitNameFor=x=>{const linked=x?.unitId?units.find(u=>u.id===x.unitId):null;return linked?.name||x?.unitName||x?.itemProduct||''};

  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selectBranch=id=>{const b=branches.find(x=>x.id===id);setForm(f=>({...f,branchId:id,branchName:b?.branchName||'',groupId:b?.groupId||f.groupId||''}))};
  const selectUnit=id=>{const u=units.find(x=>x.id===id);setForm(f=>({...f,unitId:id,unitName:u?.name||'',itemProduct:u?.name||''}))};
  const reset=()=>{setForm({...blank});setEditing(null);setSaved(false);setError('')};
  const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open')};
  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');setSaved(false);
    try{
      const existing=editing?items.find(x=>x.id===editing):null;
      const selectedBranch=branches.find(b=>b.id===form.branchId);
      const selectedUnit=units.find(u=>u.id===form.unitId);
      const unitName=selectedUnit?.name||form.unitName||form.itemProduct||'';
      if(!selectedBranch) throw new Error('Please select a branch.');
      if(!unitName) throw new Error('Please select a unit.');
      const payload={...form,unitId:selectedUnit?.id||form.unitId||'',unitName,itemProduct:unitName,status:editing?(existing?.status||NOT_REPLACED):NOT_REPLACED,groupId:selectedBranch?.groupId||form.groupId||profile.groupId||'unassigned',updatedAt:serverTimestamp()};
      if(editing){
        if(!existing) throw new Error('Retirement record not found.');
        if(!['admin','super_admin'].includes(profile.role)) throw new Error('Only Admin or Super Admin can edit retirement records.');
        await updateDoc(doc(db,'retirements',editing),payload);
        await audit({action:'UPDATE_RETIREMENT',details:`Updated retirement record for ${form.assetCode||form.unitName||form.itemProduct}`,targetUserId:editing})
      }
      else {payload.createdBy=profile.uid;payload.createdByName=profile.name||profile.username||'';payload.createdAt=serverTimestamp();const ref=await addDoc(collection(db,'retirements'),payload);await audit({action:'CREATE_RETIREMENT',details:`Created retirement record for ${form.assetCode||form.unitName||form.itemProduct}`,targetUserId:ref.id})}
      await load();setSaved(true);reset();return true;
    }catch(e){setError(e.message);return false}finally{setSaving(false)}
  };
  const requestStatusChange=(record,value)=>{
    const current=String(record?.status||NOT_REPLACED).trim()===REPLACED?REPLACED:NOT_REPLACED;
    if(current===REPLACED) return;
    if(value!==REPLACED){
      if(value===NOT_REPLACED && current!==NOT_REPLACED) setError('This retirement record is already marked Replaced and its status can no longer be changed.');
      return;
    }
    setConfirm({
      title:'Confirm Replacement Status',
      message:`You are about to mark ${record.assetCode||unitNameFor(record)||'this retirement record'} as Replaced.\n\nOnce confirmed, this status will be locked and cannot be changed back to Not Replaced.`,
      confirmLabel:'Confirm & Lock',
      danger:false,
      onConfirm:async()=>{
        setConfirmSaving(true);setError('');
        try{
          await updateDoc(doc(db,'retirements',record.id),{status:REPLACED,updatedAt:serverTimestamp()});
          await audit({action:'UPDATE_RETIREMENT_STATUS',details:`Marked retirement record as Replaced for ${record.assetCode||record.itemProduct}`,targetUserId:record.id});
          setConfirm(null);
          await load();
          setSaved(true);
        }catch(e){
          setError(e.message||'Failed to update replacement status.');
        }finally{setConfirmSaving(false)}
      }
    });
  };
  const edit=x=>{if(!['admin','super_admin'].includes(profile.role))return;const legacyUnit=x.unitId?x.unitId:(units.find(u=>normalizeKey(u.name)===normalizeKey(x.unitName||x.itemProduct))?.id||'');const legacyUnitName=x.unitName||x.itemProduct||'';setEditing(x.id);setForm({...blank,...x,unitId:legacyUnit,unitName:legacyUnitName,itemProduct:legacyUnitName,status:NOT_REPLACED});setError('');setSaved(false);setModalOpen(true);document.body.classList.add('modal-open')};
  const handleRowClick=(e,x)=>{if(!['admin','super_admin'].includes(profile.role))return;if(e.target.closest('button,select,input,a'))return;edit(x)};
  const handleRowKeyDown=(e,x)=>{if(!['admin','super_admin'].includes(profile.role))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();edit(x)}};
  const exportRetirements=async()=>{
    const rows=filtered.map(x=>({
      'BRANCH NAME':val(x.branchName),'ASSET CODE':val(x.assetCode),'SERIAL NO.':val(x.serialNo),
      'UNIT':val(unitNameFor(x)),'DEFECTIVE NOTE':val(x.defectiveNote),'DATE PURCHASE':val(x.datePurchase),
      'DATE RETIRED':val(x.dateRetired),'RECEIVED BY':val(x.receivedBy),'RECEIVED DATE':val(x.receivedDate),'STATUS':val(x.status||NOT_REPLACED)
    }));
    const ws=XLSX.utils.json_to_sheet(rows);
    ws['!cols']=[{wch:24},{wch:16},{wch:20},{wch:28},{wch:42},{wch:16},{wch:16},{wch:24},{wch:16},{wch:16}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Retirement');
    const stamp=new Date().toISOString().slice(0,10);XLSX.writeFile(wb,`EDP_Retirement_${stamp}.xlsx`);
    try{await audit({action:'EXPORT_RETIREMENTS',details:`Exported ${rows.length} retirement records to Excel`})}catch(e){console.warn('Audit export failed',e)}
  };
  const toImportRow=row=>{
    const get=(...keys)=>{for(const k of keys){const target=normalizeKey(k);const found=Object.keys(row).find(h=>normalizeKey(h)===target);if(found!==undefined)return row[found]}return ''};
    return {branchName:get('BRANCH NAME','BRANCH'),assetCode:get('ASSET CODE'),serialNo:get('SERIAL NO.','SERIAL NUMBER'),itemProduct:get('UNIT','ITEM PRODUCTS','ITEM PRODUCT','PRODUCT'),defectiveNote:get('DEFECTIVE NOTE','DEFECT'),datePurchase:get('DATE PURCHASE'),dateRetired:get('DATE RETIRED'),receivedBy:get('RECEIVED BY'),receivedDate:get('RECEIVED DATE'),status:(String(get('STATUS')||NOT_REPLACED).trim()===REPLACED?REPLACED:NOT_REPLACED)};
  };
  const handleImportFile=async e=>{
    const file=e.target.files?.[0];if(!file)return;setImportFile(file);setImportError('');setImportRows([]);
    try{const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:'array',cellDates:false});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:''});const mapped=rows.map(toImportRow).filter(r=>Object.values(r).some(v=>String(v??'').trim()!==''));setImportRows(mapped);if(!mapped.length)throw new Error('Walang records na nakita sa file.')}catch(e){setImportError(e.message||'Hindi mabasa ang Excel file.');setImportRows([])}};
  const importRetirements=async()=>{
    if(!importRows.length)return;setImporting(true);setImportError('');
    try{
      const branchMap=new Map(branches.map(b=>[normalizeKey(b.branchName),b]));
      const invalid=[];const payloads=[];
      importRows.forEach((r,i)=>{
        const b=branchMap.get(normalizeKey(r.branchName));
        const u=units.find(x=>normalizeKey(x.name)===normalizeKey(r.unitName||r.itemProduct));
        if(!b||!u||!r.assetCode||!r.dateRetired){invalid.push(`Row ${i+2}: branch, asset code, unit and date retired are required${b?'':' (branch not found)'}${u?'':' (unit not found)'}`);return;}
        payloads.push({...r,unitId:u.id,unitName:u.name,itemProduct:u.name,branchId:b.id,branchName:b.branchName,groupId:b.groupId||'unassigned',createdBy:profile.uid,createdByName:profile.name||profile.username||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      });
      if(invalid.length)throw new Error(invalid.slice(0,8).join(' | ')+(invalid.length>8?` | +${invalid.length-8} more`:''));
      for(const payload of payloads){const ref=await addDoc(collection(db,'retirements'),payload);try{await audit({action:'CREATE_RETIREMENT',details:`Imported retirement record for ${payload.assetCode||payload.itemProduct}`,targetUserId:ref.id})}catch(e){console.warn('Audit import failed',e)}}
      await audit({action:'IMPORT_RETIREMENTS',details:`Imported ${payloads.length} retirement records from ${importFile?.name||'Excel'}`});
      setImportRows([]);setImportFile(null);setShowImport(false);await load();setSaved(true);
    }catch(e){setImportError(e.message||'Hindi ma-import ang retirement records.')}finally{setImporting(false)}
  };

  const remove=async(x,onDone)=>{
    if(!['admin','super_admin'].includes(profile.role)){setError('Only Admin or Super Admin can delete retirement records.');return;}
    setConfirm({
      title:'Delete Retirement Record',
      message:`Delete retirement record for ${x.assetCode||unitNameFor(x)||'this item'}?`,
      confirmLabel:'Delete',
      danger:true,
      onConfirm:async()=>{
        setConfirmSaving(true);
        try{
          await deleteDoc(doc(db,'retirements',x.id));
          await audit({action:'DELETE_RETIREMENT',details:`Deleted retirement record for ${x.assetCode||unitNameFor(x)}`,targetUserId:x.id});
          await load();
          if(onDone)onDone();
        }catch(e){
          setError(e.message);
        }finally{
          setConfirmSaving(false);
          setConfirm(null);
        }
      }
    });
  };
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>[x.branchName,x.assetCode,x.serialNo,unitNameFor(x),x.unitName,x.itemProduct,x.defectiveNote,x.datePurchase,x.dateRetired,x.receivedBy,x.receivedDate,x.status].join(' ').toLowerCase().includes(q))},[items,search]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,totalPages);const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>{setPage(1)},[search]);

  return <>
    <div className="page-title-row"><div><span className="eyebrow">ASSET MANAGEMENT</span><h1>Retirement</h1><p>Admin can view and manage all retirement records across all branches. Employees can add retirement records within their group.</p></div><div className="page-actions no-print"><button className="ghost-btn" type="button" onClick={exportRetirements}>⇩ Export Excel</button><button className="ghost-btn" type="button" onClick={()=>{setImportRows([]);setImportFile(null);setImportError('');setShowImport(true)}}>⇧ Import Excel</button><button className="amber-btn" onClick={()=>{reset();setModalOpen(true);document.body.classList.add('modal-open')}}>＋ Add Retirement Record</button></div></div>
    {error&&<div className="error no-print">{error}</div>}
    {saved&&<div className="success no-print">Retirement record saved successfully.</div>}
    {showImport&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowImport(false)}}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-retirement-title">
        <div className="modal-header"><div><p className="eyebrow">BULK DATA ENTRY</p><h2 id="import-retirement-title">Import Retirement Records</h2><p className="subtext">Upload an Excel file and review the records before saving them to Firebase.</p></div><button className="modal-close" type="button" aria-label="Close" onClick={()=>setShowImport(false)}>×</button></div>
        <div className="modal-body">
          <div className="import-help"><div className="import-help-title">Import requirements</div><p><b>Required:</b> BRANCH NAME, ASSET CODE, UNIT and DATE RETIRED. STATUS is optional and defaults to Not Replaced. The branch name must already exist in Branch Management.</p><div className="import-column-list">BRANCH NAME · ASSET CODE · SERIAL NO. · UNIT · DEFECTIVE NOTE · DATE PURCHASE · DATE RETIRED · RECEIVED BY · RECEIVED DATE · STATUS</div></div>
          <label className="file-picker"><span>{importFile?importFile.name:'Choose Excel file (.xlsx/.xls)'}</span><input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleImportFile}/></label>
          {importError&&<div className="error">{importError}</div>}
          {importRows.length>0&&<div className="import-preview"><b>{importRows.length} record{importRows.length===1?'':'s'} ready to import.</b><div className="table-wrap"><table><thead><tr><th>BRANCH</th><th>ASSET CODE</th><th>UNIT</th><th>DATE RETIRED</th></tr></thead><tbody>{importRows.slice(0,8).map((r,i)=><tr key={i}><td>{val(r.branchName)||'—'}</td><td>{val(r.assetCode)||'—'}</td><td>{val(r.unitName||r.itemProduct)||'—'}</td><td>{val(r.dateRetired)||'—'}</td></tr>)}</tbody></table></div>{importRows.length>8&&<p className="muted">Showing first 8 records for preview.</p>}</div>}
          <div className="branch-form-actions"><button className="ghost-btn" type="button" onClick={()=>setShowImport(false)}>Cancel</button><button className="amber-btn" type="button" disabled={!importRows.length||importing} onClick={importRetirements}>{importing?'Importing...':`Import ${importRows.length||''} Records`}</button></div>
        </div>
      </div>
    </div>}

    {modalOpen && <div className="retirement-modal-backdrop no-print" onMouseDown={e=>{if(e.target===e.currentTarget){closeModal()}}}>
      <div className="retirement-modal" role="dialog" aria-modal="true" aria-labelledby="retirement-modal-title">
        <div className="retirement-modal-header"><div><span className="eyebrow">ASSET MANAGEMENT</span><h2 id="retirement-modal-title">{editing?'Edit Retirement Record':'Add Retirement Record'}</h2><p className="muted">{profile.role==='admin'||profile.role==='super_admin'?'You can select any branch. The record is saved under the selected branch group.':'This retirement record is saved under your group. Branches shown here follow your group access.'}</p></div><button type="button" className="modal-close" aria-label="Close" onClick={closeModal}>×</button></div>
        <form className="retirement-form" onSubmit={async e=>{const ok=await save(e);if(ok)setModalOpen(false);if(ok)document.body.classList.remove('modal-open')}}>
          <div className="retirement-grid">
            <label className="field span-2"><span>Branch Name</span><select value={form.branchId} onChange={e=>selectBranch(e.target.value)} required><option value="">Select branch...</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></label>
            <label className="field"><span>Asset Code</span><input value={form.assetCode} onChange={e=>change('assetCode',e.target.value)} required placeholder="e.g. AST-0001"/></label>
            <label className="field"><span>Serial No.</span><input value={form.serialNo} onChange={e=>change('serialNo',e.target.value)} placeholder="Serial number"/></label>
            <label className="field span-2"><span>Unit</span><select value={form.unitId} onChange={e=>selectUnit(e.target.value)} required><option value="">Select unit...</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label className="field span-2"><span>Defective Note</span><textarea value={form.defectiveNote} onChange={e=>change('defectiveNote',e.target.value)} rows="2" placeholder="Describe the defect, damage, or reason for retirement..."/></label>
            <label className="field"><span>Date Purchase</span><input type="date" value={form.datePurchase} onChange={e=>change('datePurchase',e.target.value)}/></label>
            <label className="field"><span>Date Retired</span><input type="date" value={form.dateRetired} onChange={e=>change('dateRetired',e.target.value)} required/></label>
            <label className="field"><span>Received By</span><input value={form.receivedBy} onChange={e=>change('receivedBy',e.target.value)} placeholder="Name of receiver"/></label>
            <label className="field"><span>Received Date</span><input type="date" value={form.receivedDate} onChange={e=>change('receivedDate',e.target.value)}/></label>
          </div>
          <div className="retirement-actions">{editing&&<button type="button" className="link-btn danger-link" disabled={saving} onClick={()=>{const x=items.find(i=>i.id===editing);if(x)remove(x,closeModal)}}>Delete Record</button>}<div className="retirement-actions-right"><button type="button" className="outline-btn" onClick={closeModal}>Cancel</button><button className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Update Record':'Save Retirement'}</button></div></div>
        </form>
      </div>
    </div>}

    <div className="toolbar-row no-print"><div className="search-wrap"><span>⌕</span><input placeholder="Search branch, asset code, serial no., product..." value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span></div>
    <div className="content-card table-wrap retirement-table">
      <table><thead><tr><th>BRANCH NAME</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>UNIT</th><th>DEFECTIVE NOTE</th><th>DATE PURCHASE</th><th>DATE RETIRED</th><th>RECEIVED BY</th><th>RECEIVED DATE</th><th>STATUS</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={10} className="empty-state">Loading...</td></tr>:shown.length?shown.map(x=><tr key={x.id} className={['admin','super_admin'].includes(profile.role)?'retirement-clickable-row':''} onClick={e=>handleRowClick(e,x)} onKeyDown={e=>handleRowKeyDown(e,x)} tabIndex={['admin','super_admin'].includes(profile.role)?0:undefined} role={['admin','super_admin'].includes(profile.role)?'button':undefined} aria-label={['admin','super_admin'].includes(profile.role)?`Edit retirement record ${x.assetCode||x.itemProduct||''}`:undefined}><td><b>{val(x.branchName)||'—'}</b></td><td><span className="retired-pill">{val(x.assetCode)||'—'}</span></td><td>{val(x.serialNo)||'—'}</td><td>{val(unitNameFor(x))||'—'}</td><td className="retirement-note">{val(x.defectiveNote)||'—'}</td><td>{val(x.datePurchase)||'—'}</td><td>{val(x.dateRetired)||'—'}</td><td>{val(x.receivedBy)||'—'}</td><td>{val(x.receivedDate)||'—'}</td><td className="retirement-status-cell">{['admin','super_admin'].includes(profile.role)?<select className={`retirement-status-select ${(x.status||NOT_REPLACED).toLowerCase().replace(/\s+/g,'-')}`} value={x.status||NOT_REPLACED} onClick={e=>e.stopPropagation()} onChange={e=>requestStatusChange(x,e.target.value)} disabled={(x.status||NOT_REPLACED)===REPLACED} aria-label={`Replacement status for ${x.assetCode||x.itemProduct||'retirement record'}`}><option value={NOT_REPLACED}>{NOT_REPLACED}</option><option value={REPLACED}>{REPLACED}</option></select>:<span className={`replacement-status-pill ${(x.status||NOT_REPLACED).toLowerCase().replace(/\s+/g,'-')}`}>{val(x.status||NOT_REPLACED)}</span>}{(x.status||NOT_REPLACED)===REPLACED&&<small className="retirement-status-locked">🔒 Locked</small>}</td></tr>):<tr><td colSpan={10} className="empty-state">No retirement records found.</td></tr>}</tbody></table>
      {!loading&&filtered.length>0&&(()=>{
        const pages=[];
        const addPage=p=>pages.push(p);
        if(totalPages<=7){
          for(let p=1;p<=totalPages;p++) addPage(p);
        }else{
          addPage(1);
          if(safePage>4) pages.push('ellipsis-start');
          const start=Math.max(2,safePage-1);
          const end=Math.min(totalPages-1,safePage+1);
          for(let p=start;p<=end;p++) addPage(p);
          if(safePage<totalPages-3) pages.push('ellipsis-end');
          addPage(totalPages);
        }
        return <div className="retirement-pagination no-print" aria-label="Retirement table pagination">
          <span className="retirement-pagination-info">Showing <b>{(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE,filtered.length)}</b> of <b>{filtered.length}</b></span>
          <div className="retirement-pagination-controls">
            <button type="button" className="retirement-page-btn arrow" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))} aria-label="Previous page">‹</button>
            {pages.map((p,i)=>p.toString().startsWith('ellipsis')?
              <span key={p+i} className="retirement-page-ellipsis">…</span>:
              <button type="button" key={p} className={`retirement-page-btn${safePage===p?' active':''}`} aria-current={safePage===p?'page':undefined} onClick={()=>setPage(p)}>{p}</button>
            )}
            <button type="button" className="retirement-page-btn arrow" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} aria-label="Next page">›</button>
          </div>
        </div>;
      })()}
    </div>
    <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
  </>;
}