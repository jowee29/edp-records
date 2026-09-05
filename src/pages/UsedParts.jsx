import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';
import ConfirmModal from '../components/ConfirmModal';

const blank={itemCode:'',inventoryId:'',branch:'',assetCode:'',serialNo:'',date:'',srf:'',edpStaff:'',status:'NOT DR',notes:''};
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);
const dateText=x=>{if(!x)return '—'; if(typeof x==='string')return x; if(x?.toDate)return x.toDate().toLocaleDateString('en-PH',{year:'numeric',month:'2-digit',day:'2-digit'}); return String(x)};

export default function UsedParts(){
  const {profile}=useAuth();
  const [items,setItems]=useState([]),[users,setUsers]=useState([]),[branches,setBranches]=useState([]),[inventory,setInventory]=useState([]),[form,setForm]=useState({...blank});
  const [editing,setEditing]=useState(null),[modalOpen,setModalOpen]=useState(false),[viewing,setViewing]=useState(null),[search,setSearch]=useState(''),[branchFilter,setBranchFilter]=useState('ALL'),[statusFilter,setStatusFilter]=useState('ALL'),[page,setPage]=useState(1);
  const [bulkRows,setBulkRows]=useState([{...blank}]);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [confirm,setConfirm]=useState(null),[confirmSaving,setConfirmSaving]=useState(false);

  const load=async()=>{
    if(profile?.role!=='super_admin')return;
    setLoading(true);setError('');
    try{
      const [partsSnap,usersSnap,branchesSnap,inventorySnap]=await Promise.all([
        getDocs(query(collection(db,'usedParts'),orderBy('createdAt','desc'))).catch(()=>getDocs(collection(db,'usedParts'))),
        getDocs(query(collection(db,'users'),orderBy('name','asc'))).catch(()=>getDocs(collection(db,'users'))),
        getDocs(query(collection(db,'branches'),orderBy('branchName','asc'))).catch(()=>getDocs(collection(db,'branches'))),
        getDocs(query(collection(db,'partsInventory'),orderBy('itemCode','asc'))).catch(()=>getDocs(collection(db,'partsInventory')))
      ]);
      setItems(partsSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      setUsers(usersSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.name||u.username).sort((a,b)=>val(a.name||a.username).localeCompare(val(b.name||b.username))));
      const branchNames=[...new Set(branchesSnap.docs.map(d=>val(d.data()?.branchName).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      setBranches(branchNames);
      setInventory(inventorySnap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){setError(e.message||'Unable to load Used Parts.')}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const reset=()=>{setForm({...blank});setBulkRows([{...blank}]);setEditing(null);setError('')};
  const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open')};
  const openView=x=>{setViewing(x);document.body.classList.add('modal-open')};
  const viewingBranchItems=useMemo(()=>viewing ? items.filter(item=>val(item.branch).trim().toLowerCase()===val(viewing.branch).trim().toLowerCase()).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)) : [],[items,viewing]);
  const closeView=()=>{setViewing(null);document.body.classList.remove('modal-open')};
  const updateFromView=()=>{if(viewing){const x=viewing;closeView();openEdit(x)}};
  const markAsDR=async x=>{
    if(!x || x.status==='DR')return;
    setConfirm({title:'Mark as DR',message:`Markahan bilang DR ang Used Parts ${x.itemCode||''} / ${x.assetCode||''} / ${x.serialNo||x.assetSerialNo||''}?\n\nAng status nito ay magiging DR.`,confirmLabel:'Mark as DR',danger:false,onConfirm:async()=>{setConfirmSaving(true);try{
      await updateDoc(doc(db,'usedParts',x.id),{status:'DR',updatedAt:serverTimestamp()});
      await audit({action:'MARK_USED_PART_DR',details:`Marked Used Part ${x.itemCode||''} / ${x.assetCode||''} / ${x.serialNo||x.assetSerialNo||''} as DR`,targetUserId:x.id});
      await load();
      setViewing(v=>v ? ({...v,status:v.id===x.id?'DR':v.status}) : v);
    }catch(e){setError(e.message||'Unable to update Used Parts status.')}finally{setConfirmSaving(false);setConfirm(null)}}});
  };
  const deleteFromView=async()=>{if(viewing){const x=viewing;closeView();await remove(x)}};
  const openAdd=()=>{reset();setBulkRows([{...blank,branch:branches[0]||''}]);setModalOpen(true);document.body.classList.add('modal-open')};
  const openEdit=x=>{
    const matchedInventoryId=x.inventoryId || inventory.find(i=>val(i.itemCode).trim().toLowerCase()===val(x.itemCode).trim().toLowerCase() && val(i.controlSerialNo).trim().toLowerCase()===val(x.serialNo||x.assetSerialNo).trim().toLowerCase())?.id || '';
    setEditing(x.id);setForm({...blank,...x,inventoryId:matchedInventoryId,assetCode:val(x.assetCode),serialNo:val(x.serialNo||x.assetSerialNo),date:x.date||''});setError('');setModalOpen(true);document.body.classList.add('modal-open');
  };

  const itemCodeOptions=useMemo(()=>inventory
    .filter(i=>val(i.itemCode).trim() && (Number(i.quantity)||0)>0)
    .sort((a,b)=>{
      const codeCmp=val(a.itemCode).localeCompare(val(b.itemCode));
      return codeCmp || val(a.controlSerialNo).localeCompare(val(b.controlSerialNo));
    }),[inventory]);

  const selectedInventory=useMemo(()=>inventory.find(i=>i.id===form.inventoryId)||null,[inventory,form.inventoryId]);

  const selectItemCode=value=>{
    const inv=inventory.find(i=>i.id===value);
    if(!inv)return setForm(f=>({...f,itemCode:'',inventoryId:'',assetCode:'',serialNo:''}));
    setForm(f=>({...f,itemCode:val(inv.itemCode),inventoryId:inv.id}));
  };

  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');
    try{
      const rows=editing?[form]:bulkRows;
      if(!rows.length)throw new Error('Magdagdag ng kahit isang Used Part item.');
      const normalized=rows.map((r,idx)=>({
        ...r,itemCode:val(r.itemCode).trim(),assetCode:val(r.assetCode).trim(),serialNo:val(r.serialNo).trim(),branch:val(r.branch).trim(),date:val(r.date),srf:val(r.srf).trim(),edpStaff:val(r.edpStaff).trim(),status:r.status==='DR'?'DR':'NOT DR',notes:val(r.notes).trim(),rowIndex:idx
      }));
      for(const r of normalized){
        if(!r.itemCode||!r.inventoryId||!r.branch||!r.date||!r.srf||!r.edpStaff||!r.assetCode||!r.serialNo)throw new Error(`Complete ang required fields (kasama ang Asset Code at Serial No.) sa Item #${r.rowIndex+1}.`);
      }
      const seen=new Set();
      for(const r of normalized){
        const key=`${r.itemCode.toLowerCase()}|${r.assetCode.toLowerCase()}|${r.serialNo.toLowerCase()}`;
        if(seen.has(key))throw new Error(`Duplicate ang Item Code at Asset Code sa Item #${r.rowIndex+1}.`);
        seen.add(key);
        const duplicate=items.some(x=>x.id!==editing && val(x.itemCode).trim().toLowerCase()===r.itemCode.toLowerCase() && val(x.assetCode).trim().toLowerCase()===r.assetCode.toLowerCase() && val(x.serialNo||x.assetSerialNo).trim().toLowerCase()===r.serialNo.toLowerCase());
        if(duplicate)throw new Error(`May existing Used Parts record na kapareho ng Item Code at Asset Code/Serial No. sa Item #${r.rowIndex+1}.`);
      }

      await runTransaction(db,async transaction=>{
        const oldRecord=editing ? items.find(x=>x.id===editing) : null;
        const oldInventoryId=oldRecord?.inventoryId || inventory.find(i=>val(i.itemCode).trim().toLowerCase()===val(oldRecord?.itemCode).trim().toLowerCase() && val(i.controlSerialNo).trim().toLowerCase()===val(oldRecord?.serialNo||oldRecord?.assetSerialNo).trim().toLowerCase())?.id || '';
        const inventoryIds=[...new Set(normalized.map(r=>r.inventoryId))];
        const invSnaps=new Map();
        for(const id of inventoryIds){const ref=doc(db,'partsInventory',id);const snap=await transaction.get(ref);if(!snap.exists())throw new Error('May napiling inventory item na wala na sa Parts Inventory. I-refresh ang page.');invSnaps.set(id,{ref,snap,qty:Number(snap.data()?.quantity)||0});}
        if(editing){
          const r=normalized[0];
          const newInv=invSnaps.get(r.inventoryId);
          if(oldInventoryId!==r.inventoryId){
            if(newInv.qty<1)throw new Error(`Walang available quantity para sa ${r.itemCode}.`);
            if(oldInventoryId){const oldRef=doc(db,'partsInventory',oldInventoryId);const oldSnap=await transaction.get(oldRef);if(oldSnap.exists())transaction.update(oldRef,{quantity:(Number(oldSnap.data()?.quantity)||0)+1,updatedAt:serverTimestamp()});}
            transaction.update(newInv.ref,{quantity:newInv.qty-1,updatedAt:serverTimestamp()});
          }
          const payload={itemCode:r.itemCode,inventoryId:r.inventoryId,branch:r.branch,assetCode:r.assetCode,serialNo:r.serialNo,assetSerialNo:r.serialNo,date:r.date,srf:r.srf,edpStaff:r.edpStaff,status:r.status,notes:r.notes,updatedAt:serverTimestamp()};
          transaction.update(doc(db,'usedParts',editing),payload);
        }else{
          const counts=new Map();normalized.forEach(r=>counts.set(r.inventoryId,(counts.get(r.inventoryId)||0)+1));
          for(const [id,count] of counts){const inv=invSnaps.get(id);if(inv.qty<count){const item=normalized.find(r=>r.inventoryId===id);throw new Error(`Walang sapat na quantity para sa ${item?.itemCode||'selected item'}. Available: ${inv.qty}, kailangan: ${count}.`);}}
          for(const [id,count] of counts){const inv=invSnaps.get(id);transaction.update(inv.ref,{quantity:inv.qty-count,updatedAt:serverTimestamp()});}
          for(const r of normalized){
            const payload={itemCode:r.itemCode,inventoryId:r.inventoryId,branch:r.branch,assetCode:r.assetCode,serialNo:r.serialNo,assetSerialNo:r.serialNo,date:r.date,srf:r.srf,edpStaff:r.edpStaff,status:r.status,notes:r.notes,updatedAt:serverTimestamp(),createdBy:profile.uid,createdByName:profile.name||profile.username||'',createdAt:serverTimestamp()};
            transaction.set(doc(collection(db,'usedParts')),payload);
          }
        }
      });

      await audit({action:editing?'UPDATE_USED_PART':'CREATE_USED_PART',details:`${editing?'Updated':'Created'} ${normalized.length} used part record(s) and adjusted inventory quantity`,targetUserId:editing||normalized.map(r=>r.inventoryId).join(',')});
      closeModal();await load();
    }catch(e){setError(e.message||'Unable to save Used Parts record.')}finally{setSaving(false)}
  };

  const remove=async x=>{
    setConfirm({title:'Delete Used Parts',message:`Delete Used Parts record ${x.itemCode||''}?\n\nIbabalik ang 1 quantity sa Parts Inventory.`,confirmLabel:'Delete',danger:true,onConfirm:async()=>{setConfirmSaving(true);try{
      const inventoryId=x.inventoryId || inventory.find(i=>val(i.itemCode).trim().toLowerCase()===val(x.itemCode).trim().toLowerCase() && val(i.controlSerialNo).trim().toLowerCase()===val(x.serialNo||x.assetSerialNo).trim().toLowerCase())?.id || '';
      await runTransaction(db,async transaction=>{
        const usedRef=doc(db,'usedParts',x.id);
        if(inventoryId){
          const invRef=doc(db,'partsInventory',inventoryId);const invSnap=await transaction.get(invRef);
          if(invSnap.exists())transaction.update(invRef,{quantity:(Number(invSnap.data()?.quantity)||0)+1,updatedAt:serverTimestamp()});
        }
        transaction.delete(usedRef);
      });
      await audit({action:'DELETE_USED_PART',details:`Deleted used part ${x.itemCode||''} and returned quantity to inventory`,targetUserId:x.id});await load();
    }catch(e){setError(e.message||'Unable to delete record.')}finally{setConfirmSaving(false);setConfirm(null)}}});
  };

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>{const hay=[x.itemCode,x.branch,x.assetCode,x.serialNo,x.assetSerialNo,x.date,x.srf,x.edpStaff,x.status,x.notes].join(' ').toLowerCase();return (!q||hay.includes(q))&&(branchFilter==='ALL'||x.branch===branchFilter)&&(statusFilter==='ALL'||x.status===statusFilter)})},[items,search,branchFilter,statusFilter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,totalPages);const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>setPage(1),[search,branchFilter,statusFilter]);useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);
  const drCount=items.filter(x=>x.status==='DR').length;
  if(profile?.role!=='super_admin')return <div className="screen-message"><div className="dark-card"><h2>Access Restricted</h2><p>Used Parts is available to Super Admin only.</p></div></div>;
  return <>
    <div className="page-title-row parts-page-heading"><div><span className="eyebrow">PARTS INVENTORY</span><h1>Used Parts</h1><p>Record parts that have been used. Saving a record automatically deducts 1 from the selected Parts Inventory item.</p></div><div className="page-actions no-print"><button className="amber-btn" onClick={openAdd}>＋ Add Used Part</button></div></div>
    {error&&<div className="error no-print">{error}</div>}
    <div className="parts-stat-grid"><div className="parts-stat-card"><span>TOTAL USED PARTS</span><strong>{items.length}</strong></div><div className="parts-stat-card"><span>DR</span><strong>{drCount}</strong></div><div className="parts-stat-card"><span>NOT DR</span><strong>{items.length-drCount}</strong></div><div className="parts-stat-card"><span>BRANCHES</span><strong>{branches.length}</strong></div></div>
    <div className="content-card parts-toolbar"><div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item code, serial no., SRF, staff..."/></div><select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="ALL">All Branches</option>{branches.map(b=><option key={b} value={b}>{b}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All Status</option><option value="DR">DR</option><option value="NOT DR">NOT DR</option></select></div>
    <div className="content-card table-wrap parts-table used-parts-table"><table><thead><tr><th>ITEM CODE</th><th>BRANCH</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>DATE</th><th>SRF</th><th>EDP STAFF</th><th>STATUS</th></tr></thead><tbody>{loading?<tr><td colSpan="8" className="branch-empty">Loading Used Parts...</td></tr>:shown.length===0?<tr><td colSpan="8" className="branch-empty"><div className="branch-empty-icon">◌</div><strong>No Used Parts records found</strong><p>Add a used part record to get started.</p><button className="amber-btn" onClick={openAdd}>＋ Add Used Part</button></td></tr>:shown.map(x=><tr key={x.id} className="clickable-row" onClick={()=>openView(x)} title="Click to view details"><td><span className="table-primary mono-cell">{val(x.itemCode)||'—'}</span></td><td><span className="parts-branch-badge">{val(x.branch)}</span></td><td className="mono-cell">{val(x.assetCode)||'—'}</td><td className="mono-cell">{val(x.serialNo||x.assetSerialNo)||'—'}</td><td className="mono-cell">{val(x.date)||'—'}</td><td className="mono-cell">{val(x.srf)||'—'}</td><td><span className="table-primary">{val(x.edpStaff)||'—'}</span></td><td><span className={`used-status ${x.status==='DR'?'dr':'not-dr'}`}>{x.status||'NOT DR'}</span></td></tr>)}</tbody></table></div>
    <div className="pagination-row"><span>Showing {filtered.length?((safePage-1)*PAGE_SIZE+1):0}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button className="page-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="page-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button></div></div>
    {viewing&&<div className="modal-backdrop" role="presentation"><div className="modal branch-modal parts-editor-modal used-parts-view-modal" role="dialog" aria-modal="true" aria-labelledby="used-parts-view-modal-title"><div className="modal-header"><div><p className="eyebrow">USED PARTS</p><h2 id="used-parts-view-modal-title">View Used Parts</h2><p className="subtext">Lahat ng Used Parts records sa parehong Branch ay ipinapakita rito, kasama ang DR at NOT DR.</p></div><button className="modal-close" onClick={closeView}>×</button></div><div className={`modal-body used-parts-view-body ${viewingBranchItems.length>10?"is-scrollable":""}`}><div className="view-branch-summary"><span>BRANCH</span><strong>{val(viewing.branch)||'—'}</strong><span>RECORDS</span><strong>{viewingBranchItems.length}</strong></div><div className="used-parts-view-table-wrap"><table className="used-parts-view-table"><thead><tr><th>#</th><th>ITEM CODE</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>CONTROL / SERIAL NO.</th><th>SRF</th><th>EDP STAFF</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{viewingBranchItems.map((x,index)=><tr key={x.id}><td>{index+1}</td><td><span className="table-primary mono-cell">{val(x.itemCode)||'—'}</span></td><td className="mono-cell">{val(x.assetCode)||'—'}</td><td className="mono-cell">{val(x.serialNo||x.assetSerialNo)||'—'}</td><td className="mono-cell">{val(inventory.find(i=>i.id===x.inventoryId)?.controlSerialNo || inventory.find(i=>val(i.itemCode).trim().toLowerCase()===val(x.itemCode).trim().toLowerCase() && val(i.controlSerialNo).trim().toLowerCase()===val(x.serialNo||x.assetSerialNo).trim().toLowerCase())?.controlSerialNo)||'—'}</td><td className="mono-cell">{val(x.srf)||'—'}</td><td>{val(x.edpStaff)||'—'}</td><td>{x.status==='DR'?<span className="used-status dr">DR</span>:<button type="button" className="used-status not-dr status-clickable" onClick={()=>markAsDR(x)} title="Click to mark as DR">NOT DR</button>}</td><td><div className="used-view-actions"><button type="button" className="table-action edit" onClick={()=>{closeView();openEdit(x)}}>Update</button><button type="button" className="table-action danger" onClick={()=>remove(x)}>Delete</button></div></td></tr>)}</tbody></table></div></div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeView}>Close</button></div></div></div>}
    {modalOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><div className="modal branch-modal parts-editor-modal used-parts-modal" role="dialog" aria-modal="true" aria-labelledby="used-parts-editor-modal-title"><div className="modal-header"><div><p className="eyebrow">USED PARTS</p><h2 id="used-parts-editor-modal-title">{editing?'Edit Used Part':'Add Used Parts'}</h2><p className="subtext">{editing?'I-edit ang napiling Used Part record.':'Magdagdag ng maraming Item Code, Asset Code, at Serial No. sa iisang Branch. Bawat row ay magbabawas ng 1 sa napiling Parts Inventory item.'}</p></div><button className="modal-close" onClick={closeModal}>×</button></div><form onSubmit={save}><div className="modal-body">
      {editing ? <div className="parts-form-grid">
        <label>ITEM CODE<select value={form.inventoryId} onChange={e=>selectItemCode(e.target.value)} required><option value="">Select Item Code</option>{itemCodeOptions.map(i=><option key={i.id} value={i.id}>{val(i.itemCode)} — {val(i.controlSerialNo)||'No Control/Serial No.'} (Qty: {Number(i.quantity)||0})</option>)}</select></label>
        <label>BRANCH<select value={form.branch} onChange={e=>change('branch',e.target.value)} required><option value="">Select Branch</option>{branches.map(b=><option key={b} value={b}>{b}</option>)}</select></label>
        <label>ASSET CODE<input value={form.assetCode} onChange={e=>change('assetCode',e.target.value)} placeholder="Enter Asset Code" required/></label>
        <label>SERIAL NO.<input value={form.serialNo} onChange={e=>change('serialNo',e.target.value)} placeholder="Enter Serial No." required/></label>
        <label>DATE<input type="date" value={form.date} onChange={e=>change('date',e.target.value)} required/></label>
        <label>SRF<input value={form.srf} onChange={e=>change('srf',e.target.value)} placeholder="Enter SRF" required/></label>
        <label>EDP STAFF<select value={form.edpStaff} onChange={e=>change('edpStaff',e.target.value)} required><option value="">Select EDP Staff</option>{users.map(u=><option key={u.id} value={u.name||u.username}>{u.name||u.username}</option>)}</select></label>
        <label>STATUS<select value={form.status} onChange={e=>change('status',e.target.value)}><option value="NOT DR">NOT DR</option><option value="DR">DR</option></select></label>
        <label className="full-field">NOTES<textarea value={form.notes} onChange={e=>change('notes',e.target.value)} rows="3" placeholder="Optional notes..."/></label>
      </div> : <div className="bulk-used-parts-list">{bulkRows.map((row,index)=><div className="bulk-used-part-row" key={index}><div className="bulk-row-title"><strong>ITEM #{index+1}</strong>{bulkRows.length>1&&<button type="button" className="table-action danger" onClick={()=>setBulkRows(rs=>rs.filter((_,i)=>i!==index))}>Remove</button>}</div><div className="parts-form-grid">
        <label>ITEM CODE<select value={row.inventoryId} onChange={e=>{const inv=inventory.find(i=>i.id===e.target.value);setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,inventoryId:e.target.value,itemCode:val(inv?.itemCode)}:r))}} required><option value="">Select Item Code</option>{itemCodeOptions.map(i=><option key={i.id} value={i.id}>{val(i.itemCode)} — {val(i.controlSerialNo)||'No Control/Serial No.'} (Qty: {Number(i.quantity)||0})</option>)}</select></label>
        <label>BRANCH<select value={row.branch} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,branch:e.target.value}:r))} required><option value="">Select Branch</option>{branches.map(b=><option key={b} value={b}>{b}</option>)}</select></label>
        <label>ASSET CODE<input value={row.assetCode} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,assetCode:e.target.value}:r))} placeholder="Enter Asset Code" required/></label>
        <label>SERIAL NO.<input value={row.serialNo} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,serialNo:e.target.value}:r))} placeholder="Enter Serial No." required/></label>
        <label>DATE<input type="date" value={row.date} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,date:e.target.value}:r))} required/></label>
        <label>SRF<input value={row.srf} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,srf:e.target.value}:r))} placeholder="Enter SRF" required/></label>
        <label>EDP STAFF<select value={row.edpStaff} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,edpStaff:e.target.value}:r))} required><option value="">Select EDP Staff</option>{users.map(u=><option key={u.id} value={u.name||u.username}>{u.name||u.username}</option>)}</select></label>
        <label>STATUS<select value={row.status} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,status:e.target.value}:r))}><option value="NOT DR">NOT DR</option><option value="DR">DR</option></select></label>
        <label className="full-field">NOTES<textarea value={row.notes} onChange={e=>setBulkRows(rs=>rs.map((r,i)=>i===index?{...r,notes:e.target.value}:r))} rows="2" placeholder="Optional notes..."/></label>
      </div></div>)}<button type="button" className="ghost-btn bulk-add-row" onClick={()=>setBulkRows(rs=>[...rs,{...blank,branch:rs[0]?.branch||branches[0]||''}])}>＋ Add Another Item</button></div>}
      {error&&<div className="error modal-error">{error}</div>}</div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeModal}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Save Changes':`Add ${bulkRows.length} Item${bulkRows.length===1?'':'s'}`}</button></div></form></div></div>}
    <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
  </>;
}
