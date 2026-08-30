import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, audit } from '../auth';
import ConfirmModal from '../components/ConfirmModal';
import { usePagination, TablePagination } from '../components/TablePagination';

export default function Units(){
  const {profile}=useAuth();
  const [units,setUnits]=useState([]);
  const [name,setName]=useState('');
  const [editing,setEditing]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [confirm,setConfirm]=useState(null);
  const [confirmSaving,setConfirmSaving]=useState(false);

  const load=async()=>{
    setLoading(true); setError('');
    try{
      const snap=await getDocs(query(collection(db,'units'),orderBy('name','asc')));
      setUnits(snap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){setError(e.message||'Unable to load units.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const save=async e=>{
    e.preventDefault();
    const clean=name.trim();
    if(!clean)return;
    setSaving(true); setError('');
    try{
      if(editing){
        await updateDoc(doc(db,'units',editing),{name:clean,updatedAt:serverTimestamp()});
        await audit({action:'UPDATE_UNIT',details:`Updated unit ${clean}`});
      }else{
        const ref=doc(collection(db,'units'));
        await setDoc(ref,{name:clean,createdAt:serverTimestamp(),createdBy:profile.uid});
        await audit({action:'CREATE_UNIT',details:`Created unit ${clean}`});
      }
      setName(''); setEditing(null); await load();
    }catch(e){setError(e.message||'Unable to save unit.');}
    finally{setSaving(false);}
  };

  const remove=unit=>setConfirm({
    title:'Delete Unit', message:`Delete unit ${unit.name}?`, confirmLabel:'Delete', danger:true,
    onConfirm:async()=>{
      setConfirmSaving(true); setError('');
      try{
        await deleteDoc(doc(db,'units',unit.id));
        await audit({action:'DELETE_UNIT',details:`Deleted unit ${unit.name}`});
        await load();
      }catch(e){setError(e.message||'Unable to delete unit.');}
      finally{setConfirmSaving(false);setConfirm(null);}
    }
  });

  const {pageItems,page,setPage,totalPages,pageSize}=usePagination(units,10);

  return <section>
    <div className="page-title-row"><div><p className="eyebrow">ADMINISTRATION</p><h1>Unit Management</h1></div></div>
    <div className="content-card form-panel">
      <div className="panel-heading"><div><p className="eyebrow">UNIT</p><h2>{editing?'Edit Unit':'Add New Unit'}</h2></div>{editing&&<button className="ghost-btn" type="button" onClick={()=>{setEditing(null);setName('')}}>Cancel</button>}</div>
      <form className="user-form" onSubmit={save}><input placeholder="Unit name" value={name} onChange={e=>setName(e.target.value)} required/><button className="amber-btn" disabled={saving}>{saving?(editing?'Saving...':'Adding...'):(editing?'Save Changes':'Add New Unit')}</button></form>
      {error&&<p className="error">{error}</p>}
    </div>
    <div className="content-card table-wrap units-table-card">
      <table><thead><tr><th>UNIT NAME</th><th>CREATED</th><th>ACTIONS</th></tr></thead>
        <tbody>{pageItems.map(unit=><tr key={unit.id}>
          <td><b>{unit.name}</b></td>
          <td>{unit.createdAt?.toDate ? unit.createdAt.toDate().toLocaleDateString() : '—'}</td>
          <td><div className="actions"><button className="link-btn" type="button" onClick={()=>{setEditing(unit.id);setName(unit.name)}}>Edit</button><button className="link-btn danger-link" type="button" onClick={()=>remove(unit)}>Delete</button></div></td>
        </tr>)}</tbody>
      </table>
      {loading&&<div className="empty-state">Loading units...</div>}
      {!loading&&!units.length&&<div className="empty-state">No units yet.</div>}
      {!loading&&units.length>0&&<TablePagination page={page} setPage={setPage} totalPages={totalPages} totalItems={units.length} pageSize={pageSize}/>} 
    </div>
    <ConfirmModal open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} saving={confirmSaving} onConfirm={confirm?.onConfirm||(()=>{})} onCancel={()=>{if(!confirmSaving)setConfirm(null)}}/>
  </section>;
}
