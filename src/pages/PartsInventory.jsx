import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';
import ConfirmModal from '../components/ConfirmModal';

const blank={itemCode:'',description:'',controlSerialNo:'',branch:'RCFSI-HO',quantity:'',price:''};
const PAGE_SIZE=10;
const val=x=>x===null||x===undefined?'':String(x);

export default function PartsInventory(){
  const {profile}=useAuth();
  const [items,setItems]=useState([]),[form,setForm]=useState({...blank});
  const [confirm,setConfirm]=useState(null),[confirmSaving,setConfirmSaving]=useState(false);
  const [editing,setEditing]=useState(null),[modalOpen,setModalOpen]=useState(false);
  const [search,setSearch]=useState(''),[branchFilter,setBranchFilter]=useState('ALL'),[page,setPage]=useState(1);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);

  const load=async()=>{
    if(!profile||profile.role!=='super_admin')return;
    setLoading(true);setError('');
    try{
      const base=collection(db,'partsInventory');
      let snap;
      try{snap=await getDocs(query(base,orderBy('createdAt','desc')))}catch(e){snap=await getDocs(base)}
      setItems(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    }catch(e){setError(e.message||'Unable to load Parts Inventory.')}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const reset=()=>{setForm({...blank});setEditing(null);setError('');setSaved(false)};
  const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open')};
  const openAdd=()=>{reset();setModalOpen(true);document.body.classList.add('modal-open')};
  const openEdit=x=>{setEditing(x.id);setForm({...blank,...x,quantity:x.quantity??'',price:x.price??''});setError('');setSaved(false);setModalOpen(true);document.body.classList.add('modal-open')};

  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');setSaved(false);
    try{
      const itemCode=form.itemCode.trim(),description=form.description.trim();
      if(!itemCode||!description||!form.branch)throw new Error('Item Code, Description, Branch at Quantity ay required.');
      const controlSerialNo=form.controlSerialNo.trim();
      const duplicate=items.some(x=>{
        if(x.id===editing)return false;
        const sameCode=String(x.itemCode||'').trim().toLowerCase()===itemCode.toLowerCase();
        const existingSerial=String(x.controlSerialNo||'').trim().toLowerCase();
        const newSerial=controlSerialNo.toLowerCase();
        return sameCode && existingSerial===newSerial;
      });
      if(duplicate)throw new Error('May existing inventory item na kapareho ng Item Code at Control/Serial No. Puwedeng pareho ang Item Code basta magkaiba ang Control/Serial No.');
      const payload={itemCode,description,controlSerialNo,branch:form.branch,quantity:Number(form.quantity)||0,price:Number(String(form.price).replace(/[^0-9.-]/g,''))||0,updatedAt:serverTimestamp()};
      if(editing){await updateDoc(doc(db,'partsInventory',editing),payload);await audit({action:'UPDATE_PARTS_INVENTORY',details:`Updated parts inventory ${itemCode}`,targetUserId:editing})}
      else {const ref=await addDoc(collection(db,'partsInventory'),{...payload,createdBy:profile.uid,createdByName:profile.name||profile.username||'',createdAt:serverTimestamp()});await audit({action:'CREATE_PARTS_INVENTORY',details:`Created parts inventory ${itemCode}`,targetUserId:ref.id})}
      closeModal();await load();setSaved(true);
    }catch(e){setError(e.message||'Unable to save inventory item.')}finally{setSaving(false)}
  };

  const remove=async x=>{
    setConfirm({
      title:'Delete Inventory Item',
      message:`Delete inventory item ${x.itemCode||x.description||'record'}?\n\nThis action cannot be undone.`,
      confirmLabel:'Delete',
      danger:true,
      onConfirm:async()=>{
        setConfirmSaving(true);
        try{
          await deleteDoc(doc(db,'partsInventory',x.id));
          await audit({action:'DELETE_PARTS_INVENTORY',details:`Deleted parts inventory ${x.itemCode||x.description}`,targetUserId:x.id});
          await load();
        }catch(e){
          setError(e.message||'Unable to delete inventory item.');
        }finally{
          setConfirmSaving(false);
          setConfirm(null);
        }
      }
    });
  };

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(x=>{const hay=[x.itemCode,x.description,x.controlSerialNo,x.branch,x.quantity,x.price].join(' ').toLowerCase();return (!q||hay.includes(q))&&(branchFilter==='ALL'||x.branch===branchFilter)})},[items,search,branchFilter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,totalPages);const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>{setPage(1)},[search,branchFilter]);useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);
  const totalQty=filtered.reduce((n,x)=>n+(Number(x.quantity)||0),0);const totalValue=filtered.reduce((n,x)=>n+(Number(x.quantity)||0)*(Number(x.price)||0),0);
  const money=n=>Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});

  if(profile?.role!=='super_admin')return <div className="screen-message"><div className="dark-card"><h2>Access Restricted</h2><p>Parts Inventory is available to Super Admin only.</p></div></div>;
  return <>
    <div className="page-title-row parts-page-heading"><div><span className="eyebrow">ASSET MANAGEMENT</span><h1>Parts Inventory</h1><p>Track parts, control/serial numbers, quantities and inventory value by head office branch.</p></div><div className="page-actions no-print"><button className="amber-btn" onClick={openAdd}>＋ Add Inventory Item</button></div></div>
    {error&&<div className="error no-print">{error}</div>}{saved&&<div className="success no-print">Inventory item saved successfully.</div>}
    <div className="parts-stat-grid"><div className="parts-stat-card"><span>TOTAL ITEMS</span><strong>{items.length}</strong></div><div className="parts-stat-card"><span>RCFSI-HO</span><strong>{items.filter(x=>x.branch==='RCFSI-HO').length}</strong></div><div className="parts-stat-card"><span>JWMC-HO</span><strong>{items.filter(x=>x.branch==='JWMC-HO').length}</strong></div><div className="parts-stat-card"><span>FILTERED QTY / VALUE</span><strong>{totalQty.toLocaleString()}</strong><small>₱ {money(totalValue)}</small></div></div>
    <div className="content-card parts-toolbar"><div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item code, description, serial no..."/></div><select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="ALL">All Branches</option><option value="RCFSI-HO">RCFSI-HO</option><option value="JWMC-HO">JWMC-HO</option></select></div>
    <div className="content-card table-wrap parts-table"><table><thead><tr><th>ITEM CODE</th><th>DESCRIPTION</th><th>CONTROL / SERIAL NO.</th><th>BRANCH</th><th>QUANTITY</th><th>PRICE</th><th>TOTAL VALUE</th><th className="action-col">ACTION</th></tr></thead><tbody>{loading?<tr><td colSpan="8" className="branch-empty">Loading Parts Inventory...</td></tr>:shown.length===0?<tr><td colSpan="8" className="branch-empty"><div className="branch-empty-icon">◌</div><strong>No inventory records found</strong><p>Add your first parts inventory item.</p><button className="amber-btn" onClick={openAdd}>＋ Add Inventory Item</button></td></tr>:shown.map(x=><tr key={x.id}><td><span className="table-primary mono-cell">{val(x.itemCode)||'—'}</span></td><td><span className="table-primary">{val(x.description)||'—'}</span></td><td className="mono-cell">{val(x.controlSerialNo)||'—'}</td><td><span className="parts-branch-badge">{val(x.branch)}</span></td><td className="parts-number">{Number(x.quantity||0).toLocaleString()}</td><td className="parts-number">₱ {money(x.price)}</td><td className="parts-number">₱ {money((Number(x.quantity)||0)*(Number(x.price)||0))}</td><td className="action-cell"><button className="table-action edit" onClick={()=>openEdit(x)}>Edit</button><button className="table-action danger" onClick={()=>remove(x)}>Delete</button></td></tr>)}</tbody></table></div>
    <div className="pagination-row"><span>Showing {filtered.length?((safePage-1)*PAGE_SIZE+1):0}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button className="page-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="page-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button></div></div>
    {modalOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><div className="modal branch-modal parts-editor-modal" role="dialog" aria-modal="true" aria-labelledby="parts-inventory-modal-title"><div className="modal-header"><div><p className="eyebrow">PARTS INVENTORY</p><h2 id="parts-inventory-modal-title">{editing?'Edit Inventory Item':'Add Inventory Item'}</h2><p className="subtext">Same Item Code is allowed when the Control/Serial No. is different.</p></div><button className="modal-close" onClick={closeModal}>×</button></div><form onSubmit={save}><div className="modal-body"><div className="parts-form-grid"><label>ITEM CODE<input value={form.itemCode} onChange={e=>change('itemCode',e.target.value)} required/></label><label>DESCRIPTION<input value={form.description} onChange={e=>change('description',e.target.value)} required/></label><label>CONTROL / SERIAL NO.<input value={form.controlSerialNo} onChange={e=>change('controlSerialNo',e.target.value)}/></label><label>BRANCH<select value={form.branch} onChange={e=>change('branch',e.target.value)}><option>RCFSI-HO</option><option>JWMC-HO</option></select></label><label>QUANTITY<input type="number" min="0" step="1" value={form.quantity} onChange={e=>change('quantity',e.target.value)} required/></label><label>PRICE<input type="number" min="0" step="0.01" value={form.price} onChange={e=>change('price',e.target.value)}/></label></div>{error&&<div className="error modal-error">{error}</div>}</div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeModal}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Save Changes':'Add Item'}</button></div></form></div></div>}
    <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
  </>;
}