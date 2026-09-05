import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';
import ConfirmModal from '../components/ConfirmModal';

const blank={branchId:'',branchName:'',assetCode:'',serialNo:'',itemProduct:'',notes:''};
const PAGE_SIZE=10;
const STATUSES=['Pending','On Going Repair','Retired','Repaired'];
const val=x=>x===null||x===undefined?'':String(x);
const dateText=x=>{
  if(!x)return '—';
  if(typeof x==='string')return x;
  if(x?.toDate)return x.toDate().toLocaleDateString('en-PH',{year:'numeric',month:'2-digit',day:'2-digit'});
  return String(x);
};

export default function JobOrder(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]),[items,setItems]=useState([]),[inventory,setInventory]=useState([]);
  const [confirm,setConfirm]=useState(null),[confirmSaving,setConfirmSaving]=useState(false);
  const [form,setForm]=useState({...blank}),[editing,setEditing]=useState(null);
  const [modalOpen,setModalOpen]=useState(false),[viewing,setViewing]=useState(null),[retirementOpen,setRetirementOpen]=useState(false),[retirementSource,setRetirementSource]=useState(null);
  const [repairNoticeOpen,setRepairNoticeOpen]=useState(false),[repairPartsOpen,setRepairPartsOpen]=useState(false),[repairSource,setRepairSource]=useState(null);
  const [repairPartForm,setRepairPartForm]=useState({itemCode:'',inventoryId:'',branch:'',assetCode:'',serialNo:'',date:'',srf:'',edpStaff:'',status:'NOT DR',notes:''});
  const [retirementForm,setRetirementForm]=useState({branchId:'',branchName:'',assetCode:'',serialNo:'',itemProduct:'',defectiveNote:'',datePurchase:'',dateRetired:'',receivedBy:'',receivedDate:''});
  const [search,setSearch]=useState(''),[statusFilter,setStatusFilter]=useState('ALL'),[branchFilter,setBranchFilter]=useState('ALL'),[page,setPage]=useState(1);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');

  const load=async()=>{
    if(!profile)return;
    setLoading(true);setError('');
    try{
      const scopedGroup=profile.role==='super_admin'?null:(profile.groupId||'unassigned');
      const branchQuery=scopedGroup?query(collection(db,'branches'),where('groupId','==',scopedGroup),orderBy('branchName','asc')):query(collection(db,'branches'),orderBy('branchName','asc'));
      const jobQuery=scopedGroup?query(collection(db,'jobOrders'),where('groupId','==',scopedGroup),orderBy('createdAt','desc')):query(collection(db,'jobOrders'),orderBy('createdAt','desc'));
      const [bs,js,inventorySnap]=await Promise.all([
        getDocs(branchQuery).catch(async()=>getDocs(scopedGroup?query(collection(db,'branches'),where('groupId','==',scopedGroup)):collection(db,'branches'))),
        getDocs(jobQuery).catch(async()=>getDocs(scopedGroup?query(collection(db,'jobOrders'),where('groupId','==',scopedGroup)):collection(db,'jobOrders'))),
        getDocs(query(collection(db,'partsInventory'),orderBy('itemCode','asc'))).catch(()=>getDocs(collection(db,'partsInventory')))
      ]);
      const branchRows=bs.docs.map(d=>({id:d.id,...d.data()}));
      setBranches((scopedGroup?branchRows.filter(b=>b.groupId===scopedGroup):branchRows).sort((a,b)=>val(a.branchName).localeCompare(val(b.branchName))));
      const loadedJobs=js.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!scopedGroup||x.groupId===scopedGroup);
      const alreadyRepaired=loadedJobs.filter(x=>x.status==='Repaired');
      if(alreadyRepaired.length){
        const batch=writeBatch(db);
        alreadyRepaired.forEach(x=>{
          const doneRef=doc(collection(db,'jobDone'));
          batch.set(doneRef,{branchId:x.branchId||'',branchName:x.branchName||'',assetCode:x.assetCode||'',serialNo:x.serialNo||'',itemProduct:x.itemProduct||'',notes:x.notes||'',repairedBy:x.repairedBy||x.updatedByName||x.receivedBy||profile.name||profile.username||profile.email||'User',repairedByUid:x.repairedByUid||profile.uid||'',status:'Repaired',received:false,receivedBy:'',receivedDate:'',repairedAt:x.updatedAt||x.createdAt||serverTimestamp(),createdAt:x.createdAt||serverTimestamp(),updatedAt:serverTimestamp(),sourceJobOrderId:x.id,groupId:x.groupId||profile.groupId||'unassigned',repairUsedParts:Boolean(x.repairUsedParts)});
          batch.delete(doc(db,'jobOrders',x.id));
        });
        await batch.commit();
        await Promise.all(alreadyRepaired.map(x=>audit({action:'MIGRATE_REPAIRED_TO_JOB_DONE',details:`Moved existing Repaired Job Order ${x.assetCode||''} / ${x.serialNo||''} to Job Done`,targetUserId:x.id}).catch(()=>null)));
      }
      setItems(loadedJobs.filter(x=>x.status!=='Repaired').sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      setInventory(inventorySnap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){setError(e.message||'Unable to load Job Orders.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{load()},[profile]);

  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selectBranch=id=>{
    const b=branches.find(x=>x.id===id);
    setForm(f=>({...f,branchId:id,branchName:b?.branchName||''}));
  };
  const reset=()=>{setForm({...blank});setEditing(null);setError('')};
  const closeModal=()=>{reset();setModalOpen(false);document.body.classList.remove('modal-open')};
  const openAdd=()=>{reset();setForm({...blank,branchId:branches[0]?.id||'',branchName:branches[0]?.branchName||''});setModalOpen(true);document.body.classList.add('modal-open')};
  const openEdit=x=>{setEditing(x.id);setForm({...blank,...x});setError('');setModalOpen(true);document.body.classList.add('modal-open')};
  const openView=x=>{setViewing(x);document.body.classList.add('modal-open')};
  const closeView=()=>{setViewing(null);document.body.classList.remove('modal-open')};

  const save=async e=>{
    e.preventDefault();setSaving(true);setError('');
    try{
      const branchName=val(form.branchName).trim(), assetCode=val(form.assetCode).trim(), serialNo=val(form.serialNo).trim(), itemProduct=val(form.itemProduct).trim(), notes=val(form.notes).trim();
      if(!branchName||!assetCode||!serialNo||!itemProduct)throw new Error('Complete ang lahat ng required fields.');
      const duplicate=items.some(x=>x.id!==editing && val(x.assetCode).trim().toLowerCase()===assetCode.toLowerCase() && val(x.serialNo).trim().toLowerCase()===serialNo.toLowerCase());
      if(duplicate)throw new Error('May existing Job Order na kapareho ng Asset Code at Serial No.');
      if(editing){
        await updateDoc(doc(db,'jobOrders',editing),{
          branchId:form.branchId||'',branchName,assetCode,serialNo,itemProduct,notes,
          groupId:items.find(x=>x.id===editing)?.groupId||profile.groupId||'unassigned',
          updatedAt:serverTimestamp()
        });
        await audit({action:'UPDATE_JOB_ORDER',details:`Updated Job Order for ${assetCode} / ${serialNo}`,targetUserId:editing});
      }else{
        const receivedBy=profile.name||profile.username||profile.email||'User';
        const ref=await addDoc(collection(db,'jobOrders'),{
          branchId:form.branchId||'',branchName,assetCode,serialNo,itemProduct,notes,
          status:'Pending',receivedBy,receivedByUid:profile.uid||'',
          groupId:profile.groupId||'unassigned',
          createdAt:serverTimestamp(),updatedAt:serverTimestamp()
        });
        await audit({action:'CREATE_JOB_ORDER',details:`Created Job Order for ${assetCode} / ${serialNo}`,targetUserId:ref.id});
      }
      closeModal();await load();
    }catch(e){setError(e.message||'Unable to save Job Order.')}finally{setSaving(false)}
  };

  const openRetirementFromJobOrder=x=>{
    setRetirementSource(x);
    setRetirementForm({
      branchId:x.branchId||'',branchName:x.branchName||'',assetCode:x.assetCode||'',serialNo:x.serialNo||'',
      itemProduct:x.itemProduct||'',defectiveNote:x.notes||'',datePurchase:x.datePurchase||'',dateRetired:'',
      receivedBy:x.receivedBy||profile.name||profile.username||profile.email||'',receivedDate:''
    });
    setViewing(null);
    setRetirementOpen(true);
    document.body.classList.add('modal-open');
  };
  const closeRetirement=()=>{setRetirementOpen(false);setRetirementSource(null);document.body.classList.remove('modal-open')};
  const repairInventoryOptions=useMemo(()=>inventory.filter(i=>val(i.itemCode).trim() && (Number(i.quantity)||0)>0).sort((a,b)=>val(a.itemCode).localeCompare(val(b.itemCode))),[inventory]);
  const openRepairFlow=x=>{
    setRepairSource(x);
    setRepairNoticeOpen(true);
    setRepairPartsOpen(false);
    setRepairPartForm({itemCode:'',inventoryId:'',branch:x.branchName||'',assetCode:x.assetCode||'',serialNo:x.serialNo||'',date:new Date().toISOString().slice(0,10),srf:'',edpStaff:profile.name||profile.username||profile.email||'',status:'NOT DR',notes:''});
    setViewing(null);
    document.body.classList.add('modal-open');
  };
  const closeRepairFlow=()=>{setRepairNoticeOpen(false);setRepairPartsOpen(false);setRepairSource(null);document.body.classList.remove('modal-open')};
  const chooseRepairParts=()=>{setRepairNoticeOpen(false);setRepairPartsOpen(true)};
  const moveToJobDone=async (x, extra={})=>{
    const doneRef=doc(collection(db,'jobDone'));
    const batch=writeBatch(db);
    batch.set(doneRef,{
      branchId:x.branchId||'',branchName:x.branchName||'',assetCode:x.assetCode||'',serialNo:x.serialNo||'',itemProduct:x.itemProduct||'',notes:x.notes||'',
      repairedBy:profile.name||profile.username||profile.email||x.receivedBy||'User',repairedByUid:profile.uid||'',
      status:'Repaired',received:false,receivedBy:'',receivedDate:'',repairedAt:serverTimestamp(),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
      sourceJobOrderId:x.id,groupId:x.groupId||profile.groupId||'unassigned',...extra
    });
    batch.delete(doc(db,'jobOrders',x.id));
    await batch.commit();
    return doneRef.id;
  };

  const repairWithoutParts=async()=>{
    if(!repairSource)return;
    setSaving(true);setError('');
    try{
      await moveToJobDone(repairSource,{repairUsedParts:false});
      await audit({action:'REPAIR_JOB_ORDER_NO_PARTS',details:`Completed repair for ${repairSource.assetCode||''} / ${repairSource.serialNo||''} without Used Parts and moved to Job Done`,targetUserId:repairSource.id});
      setItems(prev=>prev.filter(r=>r.id!==repairSource.id));
      closeRepairFlow();
    }catch(e){setError(e.message||'Unable to mark Job Order as Repaired.')}finally{setSaving(false)}
  };
  const saveRepairWithPart=async e=>{
    e.preventDefault();
    if(!repairSource)return;
    setSaving(true);setError('');
    try{
      const f={...repairPartForm,itemCode:val(repairPartForm.itemCode).trim(),branch:val(repairPartForm.branch).trim(),assetCode:val(repairPartForm.assetCode).trim(),serialNo:val(repairPartForm.serialNo).trim(),date:val(repairPartForm.date),srf:val(repairPartForm.srf).trim(),edpStaff:val(repairPartForm.edpStaff).trim(),notes:val(repairPartForm.notes).trim(),status:repairPartForm.status==='DR'?'DR':'NOT DR'};
      if(!f.itemCode||!f.inventoryId||!f.branch||!f.assetCode||!f.serialNo||!f.date||!f.srf||!f.edpStaff)throw new Error('Kumpletuhin muna ang required Used Parts fields.');
      const invRef=doc(db,'partsInventory',f.inventoryId);
      const jobRef=doc(db,'jobOrders',repairSource.id);
      const usedRef=doc(collection(db,'usedParts'));
      await runTransaction(db,async transaction=>{
        const invSnap=await transaction.get(invRef);
        if(!invSnap.exists())throw new Error('Napiling inventory item ay wala na sa Parts Inventory. I-refresh ang page.');
        const qty=Number(invSnap.data()?.quantity)||0;
        if(qty<1)throw new Error(`Walang available quantity para sa ${f.itemCode}.`);
        transaction.update(invRef,{quantity:qty-1,updatedAt:serverTimestamp()});
        transaction.set(usedRef,{itemCode:f.itemCode,inventoryId:f.inventoryId,branch:f.branch,assetCode:f.assetCode,serialNo:f.serialNo,assetSerialNo:f.serialNo,date:f.date,srf:f.srf,edpStaff:f.edpStaff,status:f.status,notes:f.notes,jobOrderId:repairSource.id,groupId:repairSource.groupId||profile.groupId||'unassigned',createdBy:profile.uid||'',createdByName:profile.name||profile.username||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        const doneRef=doc(collection(db,'jobDone'));
        transaction.set(doneRef,{branchId:repairSource.branchId||'',branchName:repairSource.branchName||f.branch,assetCode:repairSource.assetCode||f.assetCode,serialNo:repairSource.serialNo||f.serialNo,itemProduct:repairSource.itemProduct||'',notes:repairSource.notes||'',repairedBy:f.edpStaff||profile.name||profile.username||'',repairedByUid:profile.uid||'',status:'Repaired',received:false,receivedBy:'',receivedDate:'',repairedAt:serverTimestamp(),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),sourceJobOrderId:repairSource.id,groupId:repairSource.groupId||profile.groupId||'unassigned',repairUsedParts:true});
        transaction.delete(jobRef);
      });
      await audit({action:'REPAIR_JOB_ORDER_WITH_USED_PART',details:`Completed repair for ${f.assetCode} / ${f.serialNo}, added Used Part ${f.itemCode}, and moved to Job Done`,targetUserId:repairSource.id});
      setItems(prev=>prev.filter(r=>r.id!==repairSource.id));
      setInventory(prev=>prev.map(i=>i.id===f.inventoryId?{...i,quantity:(Number(i.quantity)||0)-1}:i));
      closeRepairFlow();
    }catch(e){setError(e.message||'Unable to save Used Part and mark Job Order as Repaired.')}finally{setSaving(false)}
  };

  const updateStatus=async(x,status)=>{
    if(x.status===status)return;
    if(status==='Retired'){openRetirementFromJobOrder(x);return;}
    if(status==='Repaired'){openRepairFlow(x);return;}
    try{
      await updateDoc(doc(db,'jobOrders',x.id),{status,updatedAt:serverTimestamp()});
      await audit({action:'UPDATE_JOB_ORDER_STATUS',details:`Changed Job Order ${x.assetCode||''} / ${x.serialNo||''} to ${status}`,targetUserId:x.id});
      setItems(prev=>prev.map(r=>r.id===x.id?{...r,status}:r));
      setViewing(v=>v&&v.id===x.id?{...v,status}:v);
    }catch(e){setError(e.message||'Unable to update Job Order status.')}
  };

  const saveRetirementFromJobOrder=async e=>{
    e.preventDefault();
    if(!retirementSource)return;
    setSaving(true);setError('');
    try{
      const f={...retirementForm};
      f.branchName=val(f.branchName).trim();f.assetCode=val(f.assetCode).trim();f.serialNo=val(f.serialNo).trim();
      f.itemProduct=val(f.itemProduct).trim();f.defectiveNote=val(f.defectiveNote).trim();f.datePurchase=val(f.datePurchase).trim();
      f.dateRetired=val(f.dateRetired).trim();f.receivedBy=val(f.receivedBy).trim();f.receivedDate=val(f.receivedDate).trim();
      if(!f.branchName||!f.assetCode||!f.itemProduct||!f.dateRetired)throw new Error('Kumpletuhin muna ang required retirement fields: Branch Name, Asset Code, Item Products at Date Retired.');
      const transferGroupId=profile.groupId||retirementSource.groupId||'unassigned';
      if((retirementSource.groupId||'unassigned')!==transferGroupId && profile.role!=='super_admin') throw new Error('Hindi tugma ang Job Order group sa account mo. I-check muna ang assigned Group ng Employee.');
      const payload={...f,groupId:transferGroupId,createdBy:profile.uid||'',createdByName:profile.name||profile.username||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),sourceJobOrderId:retirementSource.id};
      // Atomically create the Retirement record and remove the Job Order only when both succeed.
      const retirementRef=doc(collection(db,'retirements'));
      const batch=writeBatch(db);
      batch.set(retirementRef,payload);
      batch.delete(doc(db,'jobOrders',retirementSource.id));
      await batch.commit();
      await audit({action:'CREATE_RETIREMENT_FROM_JOB_ORDER',details:`Moved Job Order ${f.assetCode} / ${f.serialNo} to Retirement`,targetUserId:retirementRef.id});
      await audit({action:'DELETE_JOB_ORDER_AFTER_RETIREMENT',details:`Removed Job Order ${f.assetCode} / ${f.serialNo} after retirement transfer`,targetUserId:retirementSource.id});
      setItems(prev=>prev.filter(r=>r.id!==retirementSource.id));
      closeRetirement();
    }catch(e){setError(e.message||'Unable to transfer Job Order to Retirement.')}finally{setSaving(false)}
  };

  const remove=async x=>{
    setConfirm({title:'Delete Job Order',message:`Delete Job Order ${x.assetCode||''} / ${x.serialNo||''}?`,confirmLabel:'Delete',danger:true,onConfirm:async()=>{setConfirmSaving(true);try{
      await deleteDoc(doc(db,'jobOrders',x.id));
      await audit({action:'DELETE_JOB_ORDER',details:`Deleted Job Order ${x.assetCode||''} / ${x.serialNo||''}`,targetUserId:x.id});
      closeView();await load();
    }catch(e){setError(e.message||'Unable to delete Job Order.')}finally{setConfirmSaving(false);setConfirm(null)}}});
  };

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return items.filter(x=>{
      const hay=[x.branchName,x.assetCode,x.serialNo,x.itemProduct,x.notes,x.receivedBy,x.status,dateText(x.createdAt)].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(statusFilter==='ALL'||x.status===statusFilter)&&(branchFilter==='ALL'||x.branchName===branchFilter);
    });
  },[items,search,statusFilter,branchFilter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,totalPages);
  const shown=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  useEffect(()=>setPage(1),[search,statusFilter,branchFilter]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);

  const statusClass=s=>`job-status status-${String(s||'pending').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;

  if(!profile)return null;
  return <>
    <div className="page-title-row">
      <div><span className="eyebrow">FIELD SERVICE</span><h1>Job Order</h1><p className="subtext">Track equipment repair from Pending hanggang Repaired, Retired.</p></div>
      <div className="page-actions no-print"><button className="amber-btn" onClick={openAdd}>＋ New Job Order</button></div>
    </div>

    {error&&<div className="error no-print">{error}</div>}
    <div className="toolbar-row no-print">
      <div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search branch, asset code, serial no., item product, received by..."/></div>
      <select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="ALL">All Branches</option>{[...new Set(items.map(x=>x.branchName).filter(Boolean))].sort().map(b=><option key={b} value={b}>{b}</option>)}</select>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All Status</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
      <span className="count-label">{filtered.length} record{filtered.length===1?'':'s'}</span>
    </div>

    <div className="content-card table-card">
      <div className="table-scroll"><table className="data-table job-order-table">
        <thead><tr><th>BRANCH NAME</th><th>ASSET CODE</th><th>SERIAL NO.</th><th>ITEM PRODUCTS</th><th>NOTES</th><th>RECEIVED BY</th><th>DATE ENCODED</th><th>STATUS / ACTION</th></tr></thead>
        <tbody>
          {loading?<tr><td colSpan="8" className="empty-state">Loading Job Orders...</td></tr>:
          shown.length===0?<tr><td colSpan="8" className="empty-state"><div className="empty-icon">◌</div><strong>No Job Order records found</strong><p>Add a new Job Order to get started.</p><button className="amber-btn" onClick={openAdd}>＋ New Job Order</button></td></tr>:
          shown.map(x=><tr key={x.id} className="clickable-row" onClick={()=>openView(x)}>
            <td data-label="Branch Name"><span className="table-primary">{val(x.branchName)||'—'}</span></td>
            <td data-label="Asset Code" className="mono-cell">{val(x.assetCode)||'—'}</td>
            <td data-label="Serial No." className="mono-cell">{val(x.serialNo)||'—'}</td>
            <td data-label="Item Products">{val(x.itemProduct)||'—'}</td>
            <td data-label="Notes"><span className="job-notes-cell">{val(x.notes)||'—'}</span></td>
            <td data-label="Received By">{val(x.receivedBy)||'—'}</td>
            <td data-label="Date Encoded">{dateText(x.createdAt)}</td>
            <td data-label="Status / Action" onClick={e=>e.stopPropagation()}><select className={statusClass(x.status)} value={x.status||'Pending'} onChange={e=>updateStatus(x,e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
          </tr>)}
        </tbody>
      </table></div>
      <div className="pagination-row"><span>Showing {filtered.length?((safePage-1)*PAGE_SIZE+1):0}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button className="page-btn" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="page-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button></div></div>
    </div>

    {viewing&&(<div className="modal-backdrop" role="presentation"><div className="modal branch-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><p className="eyebrow">JOB ORDER</p><h2>View Job Order</h2><p className="subtext">Details at current repair status.</p></div><button className="modal-close" onClick={closeView}>×</button></div>
      <div className="modal-body">
        <div className="view-branch-summary"><span>BRANCH NAME</span><strong>{val(viewing.branchName)||'—'}</strong><span>STATUS</span><strong><span className={statusClass(viewing.status)}>{viewing.status||'Pending'}</span></strong></div>
        <div className="job-order-detail-grid">
          <div><span>ASSET CODE</span><strong>{val(viewing.assetCode)||'—'}</strong></div><div><span>SERIAL NO.</span><strong>{val(viewing.serialNo)||'—'}</strong></div>
          <div><span>ITEM PRODUCTS</span><strong>{val(viewing.itemProduct)||'—'}</strong></div><div className="job-notes-detail"><span>NOTES</span><strong>{val(viewing.notes)||'—'}</strong></div><div><span>RECEIVED BY</span><strong>{val(viewing.receivedBy)||'—'}</strong></div>
          <div><span>DATE ENCODED</span><strong>{dateText(viewing.createdAt)}</strong></div>
        </div>
        <div className="job-status-actions"><span>CHANGE STATUS</span><div>{STATUSES.map(s=><button key={s} type="button" className={`table-action ${viewing.status===s?'edit':''}`} onClick={()=>updateStatus(viewing,s)}>{s}</button>)}</div></div>
      </div>
      <div className="modal-footer"><button className="ghost-btn" onClick={closeView}>Close</button><button className="table-action edit" onClick={()=>{closeView();openEdit(viewing)}}>Edit</button><button className="table-action danger" onClick={()=>remove(viewing)}>Delete</button></div>
    </div></div>)}

    {repairNoticeOpen&&repairSource&&(<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeRepairFlow()}}><div className="modal branch-modal repair-notice-modal" role="dialog" aria-modal="true" aria-labelledby="repair-notice-title">
      <div className="modal-header"><div><p className="eyebrow">REPAIR COMPLETION</p><h2 id="repair-notice-title">Mark as Repaired</h2><p className="subtext">May ginamit bang Used Parts sa pag-aayos ng asset na ito?</p></div><button className="modal-close" type="button" onClick={closeRepairFlow}>×</button></div>
      <div className="modal-body"><div className="repair-question-card"><div className="repair-question-icon">?</div><strong>Gumamit ba kayo ng parts sa pag-aayos?</strong><span>Did you use any parts in this repair?</span></div><div className="repair-choice-grid"><button type="button" className="repair-choice no-parts" onClick={repairWithoutParts} disabled={saving}><strong>Wala / No</strong><span>Hindi gumamit ng parts</span></button><button type="button" className="repair-choice with-parts" onClick={chooseRepairParts} disabled={saving}><strong>Meron / Yes</strong><span>Gumamit ng parts</span></button></div></div>
      <div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeRepairFlow}>Cancel</button></div>
    </div></div>)}

    {repairPartsOpen&&repairSource&&(<div className="modal-backdrop" role="presentation"><div className="modal branch-modal parts-editor-modal job-order-editor-modal repair-parts-modal" role="dialog" aria-modal="true" aria-labelledby="repair-parts-title">
      <div className="modal-header"><div><p className="eyebrow">USED PARTS</p><h2 id="repair-parts-title">Add Used Parts</h2><p className="subtext">I-save muna ang ginamit na part. Kapag successful, magiging <strong>Repaired</strong> ang Job Order.</p></div><button className="modal-close" type="button" onClick={closeRepairFlow}>×</button></div>
      <form onSubmit={saveRepairWithPart}><div className="modal-body"><div className="repair-job-info"><span>JOB ORDER</span><strong>{val(repairSource.branchName)||'—'} &nbsp;•&nbsp; {val(repairSource.assetCode)||'—'} &nbsp;•&nbsp; {val(repairSource.serialNo)||'—'}</strong><small>{val(repairSource.itemProduct)||'—'}</small></div><div className="parts-form-grid">
        <label>ITEM CODE<select value={repairPartForm.inventoryId} onChange={e=>{const inv=inventory.find(i=>i.id===e.target.value);setRepairPartForm(f=>({...f,inventoryId:e.target.value,itemCode:val(inv?.itemCode)}))}} required><option value="">Select Item Code</option>{repairInventoryOptions.map(i=><option key={i.id} value={i.id}>{val(i.itemCode)} — {val(i.controlSerialNo)||'No Control/Serial No.'} (Qty: {Number(i.quantity)||0})</option>)}</select></label>
        <label>BRANCH<input value={repairPartForm.branch} readOnly/></label>
        <label>ASSET CODE<input value={repairPartForm.assetCode} readOnly/></label>
        <label>SERIAL NO.<input value={repairPartForm.serialNo} readOnly/></label>
        <label>DATE<input type="date" value={repairPartForm.date} onChange={e=>setRepairPartForm(f=>({...f,date:e.target.value}))} required/></label>
        <label>SRF<input value={repairPartForm.srf} onChange={e=>setRepairPartForm(f=>({...f,srf:e.target.value}))} placeholder="Enter SRF" required/></label>
        <label>EDP STAFF<input value={repairPartForm.edpStaff} readOnly/></label>
        <label>STATUS<select value={repairPartForm.status} onChange={e=>setRepairPartForm(f=>({...f,status:e.target.value}))}><option value="NOT DR">NOT DR</option><option value="DR">DR</option></select></label>
        <label className="full-span">NOTES<textarea value={repairPartForm.notes} onChange={e=>setRepairPartForm(f=>({...f,notes:e.target.value}))} rows="3" placeholder="Optional notes about the part used..."/></label>
      </div>{error&&<div className="error modal-error">{error}</div>}</div><div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeRepairFlow}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':'Save & Mark as Repaired'}</button></div></form>
    </div></div>)}

    {retirementOpen&&(<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeRetirement()}}><div className="modal branch-modal parts-editor-modal job-order-editor-modal retirement-transfer-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><p className="eyebrow">RETIREMENT TRANSFER</p><h2>Add Retirement</h2><p className="subtext">Naka-fill na ang impormasyon mula sa Job Order. I-update o kumpletuhin lamang ang kulang na retirement fields bago ilipat.</p></div><button className="modal-close" type="button" onClick={closeRetirement}>×</button></div>
      <form onSubmit={saveRetirementFromJobOrder}><div className="modal-body"><div className="parts-form-grid">
        <label>BRANCH NAME<select value={retirementForm.branchId||''} onChange={e=>{const b=branches.find(x=>x.id===e.target.value);setRetirementForm(f=>({...f,branchId:e.target.value,branchName:b?.branchName||f.branchName}))}} required><option value="">Select Branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></label>
        <label>ASSET CODE<input value={retirementForm.assetCode} onChange={e=>setRetirementForm(f=>({...f,assetCode:e.target.value}))} required/></label>
        <label>SERIAL NO.<input value={retirementForm.serialNo} onChange={e=>setRetirementForm(f=>({...f,serialNo:e.target.value}))}/></label>
        <label>ITEM PRODUCTS<input value={retirementForm.itemProduct} onChange={e=>setRetirementForm(f=>({...f,itemProduct:e.target.value}))} required/></label>
        <label className="full-span">DEFECTIVE NOTE<textarea value={retirementForm.defectiveNote} onChange={e=>setRetirementForm(f=>({...f,defectiveNote:e.target.value}))} rows="3" placeholder="Describe defect, damage, or reason for retirement..."/></label>
        <label>DATE PURCHASE<input type="date" value={retirementForm.datePurchase} onChange={e=>setRetirementForm(f=>({...f,datePurchase:e.target.value}))}/></label>
        <label>DATE RETIRED<input type="date" value={retirementForm.dateRetired} onChange={e=>setRetirementForm(f=>({...f,dateRetired:e.target.value}))} required/></label>
        <label>RECEIVED BY<input value={retirementForm.receivedBy} onChange={e=>setRetirementForm(f=>({...f,receivedBy:e.target.value}))}/></label>
        <label>RECEIVED DATE<input type="date" value={retirementForm.receivedDate} onChange={e=>setRetirementForm(f=>({...f,receivedDate:e.target.value}))}/></label>
      </div>
      {error&&<div className="error modal-error">{error}</div>}
      </div>
      <div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeRetirement}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':'Save Retirement & Move'}</button></div></form>
    </div></div>)}

    {modalOpen&&(<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><div className="modal branch-modal parts-editor-modal job-order-editor-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><p className="eyebrow">JOB ORDER</p><h2>{editing?'Edit Job Order':'New Job Order'}</h2><p className="subtext">{editing?'Update the Job Order details.':'The system automatically records RECEIVED BY and DATE ENCODED.'}</p></div><button className="modal-close" onClick={closeModal}>×</button></div>
      <form onSubmit={save}><div className="modal-body"><div className="parts-form-grid">
        <label>BRANCH NAME<select value={form.branchId} onChange={e=>selectBranch(e.target.value)} required><option value="">Select Branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></label>
        <label>ASSET CODE<input value={form.assetCode} onChange={e=>change('assetCode',e.target.value)} placeholder="Enter Asset Code" required/></label>
        <label>SERIAL NO.<input value={form.serialNo} onChange={e=>change('serialNo',e.target.value)} placeholder="Enter Serial No." required/></label>
        <label>ITEM PRODUCTS<input value={form.itemProduct} onChange={e=>change('itemProduct',e.target.value)} placeholder="Enter Item Product" required/></label>
        <label className="full-span">NOTES<textarea value={form.notes||''} onChange={e=>change('notes',e.target.value)} placeholder="Enter repair notes, issue, findings, or other details..." rows="3"/></label>
        <label>RECEIVED BY<input value={editing?(form.receivedBy||''):''} placeholder={editing?(form.receivedBy||'Auto recorded from encoder'):'Auto: current user'} readOnly/></label>
        <label>DATE ENCODED<input value={editing?dateText(form.createdAt):'Auto: upon saving'} readOnly/></label>
      </div>
      {error&&<div className="error modal-error">{error}</div>}
      </div>
      <div className="modal-footer"><button type="button" className="ghost-btn" onClick={closeModal}>Cancel</button><button type="submit" className="amber-btn" disabled={saving}>{saving?'Saving...':editing?'Save Changes':'Create Job Order'}</button></div></form>
    </div></div>)}
    <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
  </>;
}