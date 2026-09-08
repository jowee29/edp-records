import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';
import ConfirmModal from '../components/ConfirmModal';

const blank={groupId:'',groupName:'',borrowedParts:[],borrower:'',branch:'',date:'',status:'NOT RETURNED',notes:''};
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);

export default function UsedParts(){
 const {profile}=useAuth();
 const [items,setItems]=useState([]),[users,setUsers]=useState([]),[branches,setBranches]=useState([]),[groups,setGroups]=useState([]),[inventory,setInventory]=useState([]);
 const [form,setForm]=useState({...blank}),[editing,setEditing]=useState(null),[modalOpen,setModalOpen]=useState(false),[viewing,setViewing]=useState(null);
 const [search,setSearch]=useState(''),[branchFilter,setBranchFilter]=useState('ALL'),[statusFilter,setStatusFilter]=useState('ALL'),[page,setPage]=useState(1);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(null),[confirmSaving,setConfirmSaving]=useState(false);

 const load=async()=>{if(profile?.role!=='super_admin')return;setLoading(true);setError('');try{
  const [usedSnap,usersSnap,branchesSnap,groupsSnap,invSnap]=await Promise.all([
   getDocs(query(collection(db,'borrowedParts'),orderBy('createdAt','desc'))).catch(()=>getDocs(collection(db,'borrowedParts'))),
   getDocs(query(collection(db,'users'),orderBy('name','asc'))).catch(()=>getDocs(collection(db,'users'))),
   getDocs(query(collection(db,'branches'),orderBy('branchName','asc'))).catch(()=>getDocs(collection(db,'branches'))),
   getDocs(query(collection(db,'groups'),orderBy('name','asc'))).catch(()=>getDocs(collection(db,'groups'))),
   getDocs(query(collection(db,'partsInventory'),orderBy('itemCode','asc'))).catch(()=>getDocs(collection(db,'partsInventory')))
  ]);
  setItems(usedSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  setUsers(usersSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.name||u.username).sort((a,b)=>val(a.name||a.username).localeCompare(val(b.name||b.username))));
  setBranches([...new Set(branchesSnap.docs.map(d=>val(d.data()?.branchName).trim()).filter(Boolean))].sort());
  setGroups(groupsSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>val(a.name).localeCompare(val(b.name))));
  setInventory(invSnap.docs.map(d=>({id:d.id,...d.data()})));
 }catch(e){setError(e.message||'Unable to load Borrowed Parts.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[profile]);

 const reset=()=>{setForm({...blank});setEditing(null);setError('')};
 const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open')};
 const openView=x=>{setViewing(x);document.body.classList.add('modal-open')};
 const closeView=()=>{setViewing(null);document.body.classList.remove('modal-open')};
 const todayLocal=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`};
 const openAdd=()=>{reset();setForm({...blank,date:todayLocal()});setModalOpen(true);document.body.classList.add('modal-open')};
 const openEdit=x=>{setEditing(x.id);setForm({...blank,...x,borrowedParts:Array.isArray(x.borrowedParts)?x.borrowedParts:[],branch:x.branch||''});setError('');setModalOpen(true);document.body.classList.add('modal-open')};
 const setField=(k,v)=>setForm(f=>({...f,[k]:v}));
 const borrowerChange=name=>{const u=users.find(x=>val(x.name||x.username)===name);setForm(f=>({...f,borrower:name,groupId:val(u?.groupId),groupName:val(u?.groupName)}))};
 const addPart=()=>setForm(f=>({...f,borrowedParts:[...f.borrowedParts,{inventoryId:'',itemCode:'',description:'',quantity:1}]}));
 const removePart=i=>setForm(f=>({...f,borrowedParts:f.borrowedParts.filter((_,idx)=>idx!==i)}));
 const changePart=(idx,key,value)=>setForm(f=>({...f,borrowedParts:f.borrowedParts.map((p,i)=>i===idx?{...p,[key]:value}:p)}));
 const selectPart=(idx,id)=>{const inv=inventory.find(x=>x.id===id);setForm(f=>({...f,borrowedParts:f.borrowedParts.map((p,i)=>i===idx?{...p,inventoryId:id,itemCode:val(inv?.itemCode),description:val(inv?.description),maxQuantity:Number(inv?.quantity)||0}:p)}))};
 const availableFor=(id,currentQty=0)=>{const inv=inventory.find(x=>x.id===id);return (Number(inv?.quantity)||0)+(editing&&form.status==='NOT RETURNED'&&form.borrowedParts.some(p=>p.inventoryId===id)?currentQty:0)};

 const save=async e=>{e.preventDefault();setSaving(true);setError('');try{
  const parts=form.borrowedParts.map(p=>({...p,quantity:Math.max(1,Number(p.quantity)||0),itemCode:val(p.itemCode).trim(),description:val(p.description).trim()}));
  const saveDate=todayLocal();
  if(!form.groupId||!form.borrower||!parts.length)throw new Error('Required ang Group, Borrowed Parts, Quantity at Borrower.');
  if(parts.some(p=>!p.inventoryId))throw new Error('Pumili ng inventory item sa bawat Used Part.');
  const seen=new Set();for(const p of parts){if(seen.has(p.inventoryId))throw new Error('Huwag ulitin ang parehong Used Part. Pagsamahin ang quantity sa isang row.');seen.add(p.inventoryId);}
  await runTransaction(db,async tx=>{
   const old=editing?items.find(x=>x.id===editing):null;
   const oldParts=old?.status==='NOT RETURNED'?(old.borrowedParts||[]):[];
   const ids=[...new Set([...parts.map(p=>p.inventoryId),...oldParts.map(p=>p.inventoryId).filter(Boolean)])];
   const snaps=new Map();for(const id of ids){const ref=doc(db,'partsInventory',id);const snap=await tx.get(ref);if(!snap.exists())throw new Error('May inventory item na wala na. I-refresh ang page.');snaps.set(id,{ref,data:snap.data(),qty:Number(snap.data()?.quantity)||0});}
   const delta=new Map();oldParts.forEach(p=>delta.set(p.inventoryId,(delta.get(p.inventoryId)||0)+Number(p.quantity||0)));if(form.status==='NOT RETURNED')parts.forEach(p=>delta.set(p.inventoryId,(delta.get(p.inventoryId)||0)-Number(p.quantity||0)));
   for(const [id,d] of delta){const s=snaps.get(id);const next=s.qty+d;if(next<0)throw new Error(`Walang sapat na quantity para sa ${s.data?.itemCode||'selected part'}. Available: ${s.qty}.`);if(d)tx.update(s.ref,{quantity:next,updatedAt:serverTimestamp()});}
   const payload={groupId:form.groupId,groupName:form.groupName,borrowedParts:parts.map(p=>({inventoryId:p.inventoryId,itemCode:p.itemCode,description:p.description,quantity:p.quantity})),borrower:val(form.borrower).trim(),branch:val(form.branch).trim(),date:saveDate,status:form.status,notes:val(form.notes).trim(),updatedAt:serverTimestamp()};
   if(editing)tx.update(doc(db,'borrowedParts',editing),payload);else tx.set(doc(collection(db,'borrowedParts')),{...payload,createdBy:profile.uid,createdByName:profile.name||profile.username||'',createdAt:serverTimestamp()});
  });
  await audit({action:editing?'UPDATE_BORROWED_PART':'CREATE_BORROWED_PART',details:`${editing?'Updated':'Created'} borrowed part record for ${form.borrower} (${parts.map(p=>`${p.itemCode} x${p.quantity}`).join(', ')})`,targetUserId:editing||form.borrower});
  closeModal();await load();
 }catch(e){setError(e.message||'Unable to save Borrowed Part.')}finally{setSaving(false)}};

 const remove=x=>setConfirm({title:'Delete Borrowed Part',message:`Delete borrowing record for ${x.borrower||'this borrower'}?${x.status==='NOT RETURNED'?'\n\nIbabalik ang borrowed quantity sa Parts Inventory.':''}`,confirmLabel:'Delete',danger:true,onConfirm:async()=>{setConfirmSaving(true);try{
  await runTransaction(db,async tx=>{const ref=doc(db,'borrowedParts',x.id);if(x.status==='NOT RETURNED'){for(const p of x.borrowedParts||[]){if(!p.inventoryId)continue;const ir=doc(db,'partsInventory',p.inventoryId);const s=await tx.get(ir);if(s.exists())tx.update(ir,{quantity:(Number(s.data()?.quantity)||0)+Number(p.quantity||0),updatedAt:serverTimestamp()});}}tx.delete(ref)});
  await audit({action:'DELETE_BORROWED_PART',details:`Deleted borrowing record for ${x.borrower||''}`,targetUserId:x.id});closeView();await load();
 }catch(e){setError(e.message||'Unable to delete record.')}finally{setConfirmSaving(false);setConfirm(null)}}});

 const openReturn=x=>{setViewing(x);setReturnForm((x.borrowedParts||[]).map(p=>({inventoryId:p.inventoryId,itemCode:p.itemCode,description:p.description,borrowedQty:Number(p.quantity)||0,returnedQty:Number(p.quantity)||0,usedQty:0,assetCode:'',serialNo:'',status:'NOT DR',notes:''})));setReturnOpen(true);};
 const closeReturn=()=>{setReturnOpen(false);setReturnForm([])};
 const changeReturn=(i,k,v)=>setReturnForm(a=>a.map((p,idx)=>idx===i?{...p,[k]:v}:p));
 const saveReturn=async e=>{e.preventDefault();if(!viewing)return;setSaving(true);setError('');try{
  const rows=returnForm.map(r=>({...r,borrowedQty:Number(r.borrowedQty)||0,returnedQty:Math.max(0,Number(r.returnedQty)||0),usedQty:Math.max(0,Number(r.usedQty)||0)}));
  if(rows.some(r=>r.returnedQty+r.usedQty!==r.borrowedQty))throw new Error('Bawat part dapat: RETURNED QTY + USED QTY = BORROWED QTY.');
  if(rows.some(r=>r.usedQty>0&&!r.assetCode.trim()))throw new Error('Lagyan ng Asset Code ang bawat part na nagamit.');
  await runTransaction(db,async tx=>{
   const ref=doc(db,'borrowedParts',viewing.id);const snap=await tx.get(ref);if(!snap.exists())throw new Error('Borrowed record not found.');
   const invSnaps=new Map();
   for(const r of rows){if(!r.inventoryId)continue;const ir=doc(db,'partsInventory',r.inventoryId);const is=await tx.get(ir);if(!is.exists())throw new Error('May inventory item na wala na. I-refresh ang page.');invSnaps.set(r.inventoryId,{ref:ir,data:is.data(),qty:Number(is.data()?.quantity)||0});}
   for(const r of rows){const add=r.returnedQty;if(add){const inv=invSnaps.get(r.inventoryId);tx.update(inv.ref,{quantity:inv.qty+add,updatedAt:serverTimestamp()});inv.qty+=add;}}
   const usedRows=rows.filter(r=>r.usedQty>0).map(r=>({itemCode:r.itemCode,description:r.description,quantity:r.usedQty,branch:val(viewing.branch).trim(),date:todayLocal(),srf:'',edpStaff:profile.name||profile.username||'',status:r.status,notes:r.notes,createdBy:profile.uid,createdByName:profile.name||profile.username||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
   for(const u of usedRows)tx.set(doc(collection(db,'usedParts')),{...u});
   const finalParts=rows.map(r=>({...r,quantity:r.borrowedQty,returnedQty:r.returnedQty,usedQty:r.usedQty,assetCode:r.assetCode,serialNo:r.serialNo,status:r.status,notes:r.notes}));
   tx.update(ref,{status:'RETURNED',returnedAt:serverTimestamp(),returnDetails:finalParts,updatedAt:serverTimestamp()});
  });
  await audit({action:'RETURN_BORROWED_PARTS','details':`Returned/used parts processed for ${viewing.borrower||''}`,targetUserId:viewing.id});
  const updated={...viewing,status:'RETURNED',returnDetails:rows};setViewing(updated);closeReturn();await load();
 }catch(e){setError(e.message||'Unable to process return.')}finally{setSaving(false)}};

 const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>{const hay=[x.groupName,x.borrower,x.branch,x.date,x.status,x.notes,...(x.borrowedParts||[]).flatMap(p=>[p.itemCode,p.description,p.quantity])].join(' ').toLowerCase();return(!q||hay.includes(q))&&(branchFilter==='ALL'||x.branch===branchFilter)&&(statusFilter==='ALL'||x.status===statusFilter)})},[items,search,branchFilter,statusFilter]);
 const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),safePage=Math.min(page,totalPages),shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);useEffect(()=>setPage(1),[search,branchFilter,statusFilter]);
 const pending=items.filter(x=>x.status==='NOT RETURNED').length;
 if(profile?.role!=='super_admin')return <div className="screen-message"><div className="dark-card"><h2>Access Restricted</h2><p>Borrowed Parts is available to Super Admin only.</p></div></div>;
 return <>
  <div className="page-title-row parts-page-heading"><div><span className="eyebrow">USED PARTS</span><h1>Borrowed Part</h1><p>Record borrowed parts. You can select multiple parts and set the quantity for each item.</p></div><div className="page-actions no-print"><button className="amber-btn" onClick={openAdd}>＋ Add Borrowed Part</button></div></div>
  {error&&<div className="error no-print">{error}</div>}
  <div className="parts-stat-grid"><div className="parts-stat-card"><span>TOTAL BORROWINGS</span><strong>{items.length}</strong></div><div className="parts-stat-card"><span>NOT RETURNED</span><strong>{pending}</strong></div><div className="parts-stat-card"><span>RETURNED</span><strong>{items.length-pending}</strong></div><div className="parts-stat-card"><span>GROUPS</span><strong>{new Set(items.map(x=>x.groupId).filter(Boolean)).size}</strong></div></div>
  <div className="content-card parts-toolbar"><div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search group, part, borrower..."/></div><select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="ALL">All Branches</option>{branches.map(b=><option key={b}>{b}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All Status</option><option value="NOT RETURNED">Not Returned</option><option value="RETURNED">Returned</option></select></div>
  <div className="content-card table-wrap parts-table used-parts-table"><table><thead><tr><th>GROUP</th><th>USED PARTS</th><th>QUANTITY</th><th>BORROWER</th><th>BRANCH</th><th>DATE</th><th>STATUS</th></tr></thead><tbody>{loading?<tr><td colSpan="7" className="branch-empty">Loading Borrowed Parts...</td></tr>:shown.length===0?<tr><td colSpan="7" className="branch-empty"><strong>No Borrowed Parts records found</strong><p>Add a borrowed part record to get started.</p><button className="amber-btn" onClick={openAdd}>＋ Add Borrowed Part</button></td></tr>:shown.map(x=><tr key={x.id} className="clickable-row" onClick={()=>openView(x)}><td><span className="parts-branch-badge">{val(x.groupName)||'—'}</span></td><td>{(x.borrowedParts||[]).map(p=>val(p.itemCode)||val(p.description)||'—').join(', ')}</td><td>{(x.borrowedParts||[]).reduce((n,p)=>n+(Number(p.quantity)||0),0)}</td><td><span className="table-primary">{val(x.borrower)||'—'}</span></td><td>{val(x.branch)||'—'}</td><td>{val(x.date)||'—'}</td><td><span className={`used-status ${x.status==='RETURNED'?'dr':'not-dr'}`}>{x.status==='RETURNED'?'RETURNED':'NOT RETURNED'}</span></td></tr>)}</tbody></table></div>
  <div className="pagination-row"><span>Showing {filtered.length?((safePage-1)*PAGE_SIZE+1):0}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button className="page-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="page-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button></div></div>
  {viewing&&<div className="modal-backdrop"><div className="modal branch-modal parts-editor-modal used-parts-view-modal"><div className="modal-header"><div><p className="eyebrow">BORROWED PART</p><h2>View Borrowed Parts</h2><p className="subtext">Borrower details, selected parts, quantities, and return status.</p></div><button className="modal-close" onClick={closeView}>×</button></div><div className="modal-body"><div className="view-branch-summary"><span>GROUP</span><strong>{val(viewing.groupName)||'—'}</strong><span>BORROWER</span><strong>{val(viewing.borrower)||'—'}</strong><span>STATUS</span><strong>{viewing.status==='RETURNED'?'RETURNED':'NOT RETURNED'}</strong></div><div className="used-parts-view-table-wrap"><table className="used-parts-view-table"><thead><tr><th>#</th><th>USED PART</th><th>DESCRIPTION</th><th>QUANTITY</th></tr></thead><tbody>{(viewing.borrowedParts||[]).map((p,i)=><tr key={i}><td>{i+1}</td><td>{val(p.itemCode)||'—'}</td><td>{val(p.description)||'—'}</td><td>{Number(p.quantity)||0}</td></tr>)}</tbody></table></div></div><div className="modal-footer"><button className="ghost-btn" onClick={closeView}>Close</button>{viewing.status!=='RETURNED'&&<button className="amber-btn" onClick={()=>openReturn(viewing)}>Mark as Returned</button>}<button className="table-action edit" onClick={()=>{closeView();openEdit(viewing)}}>Update</button><button className="table-action danger" onClick={()=>remove(viewing)}>Delete</button></div></div></div>}
  {returnOpen&&viewing&&<div className="modal-backdrop"><div className="modal branch-modal parts-editor-modal used-parts-modal"><div className="modal-header"><div><p className="eyebrow">RETURN / USED PARTS</p><h2>Process Returned Parts</h2><p className="subtext">Ilagay kung ilan ang bumalik at ilan ang nagamit. Ang returned quantity ay automatic na idaragdag sa Parts Inventory. Ang used quantity ay mananatiling deducted at automatic na ire-record sa Used Parts.</p></div><button className="modal-close" onClick={closeReturn}>×</button></div><form onSubmit={saveReturn}><div className="modal-body"><div className="used-parts-view-table-wrap"><table className="used-parts-view-table"><thead><tr><th>USED PART</th><th>BORROWED</th><th>RETURNED</th><th>USED</th><th>ASSET CODE</th><th>SERIAL</th><th>STATUS</th><th>NOTES</th></tr></thead><tbody>{returnForm.map((r,i)=><tr key={i}><td><strong>{r.itemCode||'—'}</strong><br/><small>{r.description||''}</small></td><td>{r.borrowedQty}</td><td><input type="number" min="0" max={r.borrowedQty} value={r.returnedQty} onChange={e=>changeReturn(i,'returnedQty',e.target.value)}/></td><td><input type="number" min="0" max={r.borrowedQty} value={r.usedQty} onChange={e=>changeReturn(i,'usedQty',e.target.value)}/></td><td><input value={r.assetCode} onChange={e=>changeReturn(i,'assetCode',e.target.value)} placeholder={r.usedQty?'Asset Code':''}/></td><td><input value={r.serialNo} onChange={e=>changeReturn(i,'serialNo',e.target.value)} placeholder="Serial"/></td><td><select value={r.status} onChange={e=>changeReturn(i,'status',e.target.value)}><option>NOT DR</option><option>DR</option></select></td><td><input value={r.notes} onChange={e=>changeReturn(i,'notes',e.target.value)} placeholder="Notes"/></td></tr>)}</tbody></table></div><div className="empty-state">Rule: Borrowed = Returned + Used. Halimbawa 5 borrowed, 3 returned, 2 used → +3 sa inventory at 2 automatic na ilalagay sa Used Parts.</div>{error&&<div className="error modal-error">{error}</div>}</div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeReturn}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':'Save Return / Used Parts'}</button></div></form></div></div>}
  {modalOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><div className="modal branch-modal parts-editor-modal used-parts-modal"><div className="modal-header"><div><p className="eyebrow">USED PARTS</p><h2>{editing?'Edit Borrowed Part':'Borrowed Part'}</h2><p className="subtext">Select who borrowed the parts. The Group is automatically filled from that user's assigned team/group. The date is automatically set to today when saved.</p></div><button className="modal-close" onClick={closeModal}>×</button></div><form onSubmit={save}><div className="modal-body"><div className="parts-form-grid">
   <label>WHO BORROWED<select value={form.borrower} onChange={e=>borrowerChange(e.target.value)} required><option value="">Select Borrower</option>{users.map(u=><option key={u.id} value={u.name||u.username}>{u.name||u.username}</option>)}</select></label>
   <label>GROUP<input value={form.groupName||''} placeholder="Auto-filled from borrower team" readOnly required/></label>
   <label>DATE<input type="date" value={form.date||todayLocal()} readOnly/></label>
   <label>STATUS<select value={form.status} onChange={e=>setField('status',e.target.value)}><option value="NOT RETURNED">NOT RETURNED</option><option value="RETURNED">RETURNED</option></select></label>
   <label className="full-field">NOTES<textarea value={form.notes} onChange={e=>setField('notes',e.target.value)} rows="2" placeholder="Optional notes..."/></label>
  </div><div className="bulk-used-parts-list"><div className="bulk-row-title"><strong>USED PARTS (MULTIPLE SELECTION)</strong><button type="button" className="ghost-btn" onClick={addPart}>＋ Add Part</button></div>{form.borrowedParts.length===0&&<div className="empty-state">Click “Add Part” to select one or more parts.</div>}{form.borrowedParts.map((p,i)=><div className="bulk-used-part-row" key={i}><div className="bulk-row-title"><strong>PART #{i+1}</strong>{form.borrowedParts.length>1&&<button type="button" className="table-action danger" onClick={()=>removePart(i)}>Remove</button>}</div><div className="parts-form-grid"><label className="full-field">USED PART<select value={p.inventoryId} onChange={e=>selectPart(i,e.target.value)} required><option value="">Select Used Part</option>{inventory.filter(inv=>(Number(inv.quantity)||0)>0||inv.id===p.inventoryId).map(inv=><option key={inv.id} value={inv.id}>{val(inv.itemCode)} — {val(inv.description)} (Available: {Number(inv.quantity)||0})</option>)}</select></label><label>HOW QUANTITY<input type="number" min="1" step="1" value={p.quantity} onChange={e=>changePart(i,'quantity',e.target.value)} required/></label><label>AVAILABLE<input value={Number(inventory.find(inv=>inv.id===p.inventoryId)?.quantity)||0} readOnly/></label></div></div>)}</div>{error&&<div className="error modal-error">{error}</div>}</div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={addPart}>＋ Add Part</button><button type="button" className="ghost-btn" onClick={closeModal}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Save Changes':'Save Borrowed Part'}</button></div></form></div></div>}
  <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
 </>;
}
