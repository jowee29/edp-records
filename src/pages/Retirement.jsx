import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';

const blank={branchId:'',branchName:'',assetCode:'',serialNo:'',itemProduct:'',defectiveNote:'',datePurchase:'',dateRetired:'',receivedBy:'',receivedDate:''};
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);

export default function Retirement(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]),[items,setItems]=useState([]),[form,setForm]=useState({...blank});
  const [editing,setEditing]=useState(null),[modalOpen,setModalOpen]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [showImport,setShowImport]=useState(false),[importRows,setImportRows]=useState([]),[importFile,setImportFile]=useState(null),[importing,setImporting]=useState(false),[importError,setImportError]=useState('');

  const load=async()=>{
    if(!profile)return; setLoading(true); setError('');
    try{
      // Retirement branch selector is shared across all groups.
      // Keep Branch Management group-scoped, but load every branch name here.
      const bcol=collection(db,'branches');
      let bq=query(bcol,orderBy('branchName','asc'));
      let snap; try{snap=await getDocs(bq)}catch(e){snap=await getDocs(bcol)}
      setBranches(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.branchName||'').localeCompare(String(b.branchName||''))));
      const rcol=collection(db,'retirements');
      let rq=query(rcol,orderBy('createdAt','desc'));
      try{snap=await getDocs(rq)}catch(e){snap=await getDocs(rcol)}
      setItems(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selectBranch=id=>{const b=branches.find(x=>x.id===id);setForm(f=>({...f,branchId:id,branchName:b?.branchName||''}))};
  const reset=()=>{setForm({...blank});setEditing(null);setSaved(false);setError('')};
  const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open')};
  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');setSaved(false);
    try{
      const payload={...form,groupId:profile.groupId||'unassigned',updatedAt:serverTimestamp()};
      if(editing){
        if(profile.role!=='super_admin') throw new Error('Only Super Admin can edit retirement records.');
        await updateDoc(doc(db,'retirements',editing),payload);
        await audit({action:'UPDATE_RETIREMENT',details:`Updated retirement record for ${form.assetCode||form.itemProduct}`,targetUserId:editing})
      }
      else {payload.createdBy=profile.uid;payload.createdByName=profile.name||profile.username||'';payload.createdAt=serverTimestamp();const ref=await addDoc(collection(db,'retirements'),payload);await audit({action:'CREATE_RETIREMENT',details:`Created retirement record for ${form.assetCode||form.itemProduct}`,targetUserId:ref.id})}
      await load();setSaved(true);reset();return true;
    }catch(e){setError(e.message);return false}finally{setSaving(false)}
  };
  const edit=x=>{if(profile.role!=='super_admin')return;setEditing(x.id);setForm({...blank,...x});setError('');setSaved(false);setModalOpen(true);document.body.classList.add('modal-open')};
  const exportRetirements=async()=>{
    const rows=filtered.map(x=>({
      'BRANCH NAME':val(x.branchName),'ASSET CODE':val(x.assetCode),'SERIAL NO.':val(x.serialNo),
      'ITEM PRODUCTS':val(x.itemProduct),'DEFECTIVE NOTE':val(x.defectiveNote),'DATE PURCHASE':val(x.datePurchase),
      'DATE RETIRED':val(x.dateRetired),'RECEIVED BY':val(x.receivedBy),'RECEIVED DATE':val(x.receivedDate)
    }));
    const ws=XLSX.utils.json_to_sheet(rows);
    ws['!cols']=[{wch:24},{wch:16},{wch:20},{wch:28},{wch:42},{wch:16},{wch:16},{wch:24},{wch:16}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Retirement');
    const stamp=new Date().toISOString().slice(0,10);XLSX.writeFile(wb,`EDP_Retirement_${stamp}.xlsx`);
    try{await audit({action:'EXPORT_RETIREMENTS',details:`Exported ${rows.length} retirement records to Excel`})}catch(e){console.warn('Audit export failed',e)}
  };
  const normalizeKey=x=>String(x??'').trim().toUpperCase().replace(/[._\-/]+/g,' ').replace(/\s+/g,' ');
  const toImportRow=row=>{
    const get=(...keys)=>{for(const k of keys){const target=normalizeKey(k);const found=Object.keys(row).find(h=>normalizeKey(h)===target);if(found!==undefined)return row[found]}return ''};
    return {branchName:get('BRANCH NAME','BRANCH'),assetCode:get('ASSET CODE'),serialNo:get('SERIAL NO.','SERIAL NUMBER'),itemProduct:get('ITEM PRODUCTS','ITEM PRODUCT','PRODUCT'),defectiveNote:get('DEFECTIVE NOTE','DEFECT'),datePurchase:get('DATE PURCHASE'),dateRetired:get('DATE RETIRED'),receivedBy:get('RECEIVED BY'),receivedDate:get('RECEIVED DATE')};
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
        if(!b||!r.assetCode||!r.itemProduct||!r.dateRetired){invalid.push(`Row ${i+2}: branch, asset code, item products, at date retired are required${b?'':' (branch not found)'}`);return;}
        payloads.push({...r,branchId:b.id,branchName:b.branchName,groupId:profile.groupId||'unassigned',createdBy:profile.uid,createdByName:profile.name||profile.username||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      });
      if(invalid.length)throw new Error(invalid.slice(0,8).join(' | ')+(invalid.length>8?` | +${invalid.length-8} more`:''));
      for(const payload of payloads){const ref=await addDoc(collection(db,'retirements'),payload);try{await audit({action:'CREATE_RETIREMENT',details:`Imported retirement record for ${payload.assetCode||payload.itemProduct}`,targetUserId:ref.id})}catch(e){console.warn('Audit import failed',e)}}
      await audit({action:'IMPORT_RETIREMENTS',details:`Imported ${payloads.length} retirement records from ${importFile?.name||'Excel'}`});
      setImportRows([]);setImportFile(null);setShowImport(false);await load();setSaved(true);
    }catch(e){setImportError(e.message||'Hindi ma-import ang retirement records.')}finally{setImporting(false)}
  };

  const remove=async x=>{
    if(profile.role!=='super_admin'){setError('Only Super Admin can delete retirement records.');return;}
    if(!confirm(`Delete retirement record for ${x.assetCode||x.itemProduct||'this item'}?`))return;
    try{await deleteDoc(doc(db,'retirements',x.id));await audit({action:'DELETE_RETIREMENT',details:`Deleted retirement record for ${x.assetCode||x.itemProduct}`,targetUserId:x.id});await load()}catch(e){setError(e.message)}
  };
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>[x.branchName,x.assetCode,x.serialNo,x.itemProduct,x.defectiveNote,x.datePurchase,x.dateRetired,x.receivedBy,x.receivedDate].join(' ').toLowerCase().includes(q))},[items,search]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,totalPages);const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>{setPage(1)},[search]);

  return <>
    <div className="page-title-row"><div><span className="eyebrow">ASSET MANAGEMENT</span><h1>Retirement</h1><p>Record and monitor retired assets for all authorized branch users.</p></div><div className="page-actions no-print"><button className="ghost-btn" type="button" onClick={exportRetirements}>⇩ Export Excel</button><button className="ghost-btn" type="button" onClick={()=>{setImportRows([]);setImportFile(null);setImportError('');setShowImport(true)}}>⇧ Import Excel</button><button className="amber-btn" onClick={()=>{reset();setModalOpen(true);document.body.classList.add('modal-open')}}>＋ Add Retirement Record</button></div></div>
    {error&&<div className="error no-print">{error}</div>}
    {saved&&<div className="success no-print">Retirement record saved successfully.</div>}
    {showImport&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowImport(false)}}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-retirement-title">
        <div className="modal-header"><div><p className="eyebrow">BULK DATA ENTRY</p><h2 id="import-retirement-title">Import Retirement Records</h2><p className="subtext">Upload an Excel file and review the records before saving them to Firebase.</p></div><button className="modal-close" type="button" aria-label="Close" onClick={()=>setShowImport(false)}>×</button></div>
        <div className="modal-body">
          <div className="import-help"><div className="import-help-title">Import requirements</div><p><b>Required:</b> BRANCH NAME, ASSET CODE, ITEM PRODUCTS and DATE RETIRED. The branch name must already exist in Branch Management.</p><div className="import-column-list">BRANCH NAME · ASSET CODE · SERIAL NO. · ITEM PRODUCTS · DEFECTIVE NOTE · DATE PURCHASE · DATE RETIRED · RECEIVED BY · RECEIVED DATE</div></div>
          <label className="file-picker"><span>{importFile?importFile.name:'Choose Excel file (.xlsx/.xls)'}</span><input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleImportFile}/></label>
          {importError&&<div className="error">{importError}</div>}
          {importRows.length>0&&<div className="import-preview"><b>{importRows.length} record{importRows.length===1?'':'s'} ready to import.</b><div className="table-wrap"><table><thead><tr><th>BRANCH</th><th>ASSET CODE</th><th>ITEM</th><th>DATE RETIRED</th></tr></thead><tbody>{importRows.slice(0,8).map((r,i)=><tr key={i}><td>{val(r.branchName)||'—'}</td><td>{val(r.assetCode)||'—'}</td><td>{val(r.itemProduct)||'—'}</td><td>{val(r.dateRetired)||'—'}</td></tr>)}</tbody></table></div>{importRows.length>8&&<p className="muted">Showing first 8 records for preview.</p>}</div>}
          <div className="branch-form-actions"><button className="ghost-btn" type="button" onClick={()=>setShowImport(false)}>Cancel</button><button className="amber-btn" type="button" disabled={!importRows.length||importing} onClick={importRetirements}>{importing?'Importing...':`Import ${importRows.length||''} Records`}</button></div>
        </div>
      </div>
    </div>}

    {modalOpen && <div className="retirement-modal-backdrop no-print" onMouseDown={e=>{if(e.target===e.currentTarget){closeModal()}}}>
      <div className="retirement-modal" role="dialog" aria-modal="true" aria-labelledby="retirement-modal-title">
        <div className="retirement-modal-header"><div><span className="eyebrow">ASSET MANAGEMENT</span><h2 id="retirement-modal-title">{editing?'Edit Retirement Record':'Add Retirement Record'}</h2><p className="muted">All fields are stored in Firebase. Branch names are available to all authorized groups.</p></div><button type="button" className="modal-close" aria-label="Close" onClick={closeModal}>×</button></div>
        <form className="retirement-form" onSubmit={async e=>{const ok=await save(e);if(ok)setModalOpen(false);if(ok)document.body.classList.remove('modal-open')}}>
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
          <div className="retirement-actions"><button type="button" className="outline-btn" onClick={closeModal}>Cancel</button><button className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Update Record':'Save Retirement'}</button></div>
        </form>
      </div>
    </div>}

    <div className="toolbar-row no-print"><div className="search-wrap"><span>⌕</span><input placeholder="Search branch, asset code, serial no., product..." value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span></div>
    <div className="content-card table-wrap retirement-table">
      <table><thead><tr>{profile.role==='super_admin'&&<th>ACTION</th>}<th>BRANCH NAME</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>ITEM PRODUCTS</th><th>DEFECTIVE NOTE</th><th>DATE PURCHASE</th><th>DATE RETIRED</th><th>RECEIVED BY</th><th>RECEIVED DATE</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={profile.role==='super_admin'?10:9} className="empty-state">Loading...</td></tr>:shown.length?shown.map(x=><tr key={x.id}>{profile.role==='super_admin'&&<td><div className="actions"><button className="link-btn" onClick={()=>edit(x)}>Edit</button><button className="link-btn danger-link" onClick={()=>remove(x)}>Delete</button></div></td>}<td><b>{val(x.branchName)||'—'}</b></td><td><span className="retired-pill">{val(x.assetCode)||'—'}</span></td><td>{val(x.serialNo)||'—'}</td><td>{val(x.itemProduct)||'—'}</td><td className="retirement-note">{val(x.defectiveNote)||'—'}</td><td>{val(x.datePurchase)||'—'}</td><td>{val(x.dateRetired)||'—'}</td><td>{val(x.receivedBy)||'—'}</td><td>{val(x.receivedDate)||'—'}</td></tr>):<tr><td colSpan={profile.role==='super_admin'?10:9} className="empty-state">No retirement records found.</td></tr>}</tbody></table>
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
  </>;
}
