import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, writeBatch, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { audit, useAuth } from '../auth';

const blank = {
  branchName:'', branchType:'', company:'', accountNo:'', telNo:'', contactPerson:'', contactNo:'', address:'',
  oic:'', contactNo1:'', isp:'', connType:'Static', plan:'', monthlyPayment:'', ipAddress:'', subnetMask:'',
  defaultGateway:'', dns1:'', dns2:'', noOfComp:'', printer2175:'', lx310ii:'', colored:''
};

const sections = [
  { title:'BRANCH INFORMATION', fields:[
    ['branchName','BRANCH NAME','text',true], ['branchType','BRANCH TYPE','select',true], ['company','COMPANY'], ['accountNo','ACCOUNT NO.'],
    ['telNo','TEL. NO.'], ['address','ADDRESS','textarea'],
  ]},
  { title:'CONTACT & CONNECTIVITY', fields:[
    ['contactPerson','CONTACT PERSON'], ['contactNo','CONTACT NO.'], ['oic','OIC'], ['contactNo1','CONTACT NO._1'],
    ['isp','ISP'], ['connType','CONN_TYPE','conn'], ['plan','PLAN'], ['monthlyPayment','MONTHLY PAYMENT','number'],
    ['ipAddress','IP ADDRESS'], ['subnetMask','SUBNET MASK'], ['defaultGateway','DEFAULT GATEWAY'], ['dns1','DNS1'], ['dns2','DNS2'],
  ]},
  { title:'EQUIPMENT', fields:[
    ['noOfComp','NO. OF COMP.','number'], ['printer2175','2175/2175II'], ['lx310ii','LX-310II'], ['colored','COLORED'],
  ]},
];

const detailSections = [
  {title:'BRANCH INFORMATION', fields:[['BRANCH NAME','branchName'],['BRANCH TYPE','branchType'],['COMPANY','company'],['ACCOUNT NO.','accountNo'],['TEL. NO.','telNo'],['ADDRESS','address']]},
  {title:'CONTACT & CONNECTIVITY', fields:[['CONTACT PERSON','contactPerson'],['CONTACT NO.','contactNo'],['OIC','oic'],['CONTACT NO._1','contactNo1'],['ISP','isp'],['CONN_TYPE','connType'],['PLAN','plan'],['MONTHLY PAYMENT','monthlyPayment'],['IP ADDRESS','ipAddress'],['SUBNET MASK','subnetMask'],['DEFAULT GATEWAY','defaultGateway'],['DNS1','dns1'],['DNS2','dns2']]},
  {title:'EQUIPMENT', fields:[['NO. OF COMP.','noOfComp'],['2175/2175II','printer2175'],['LX-310II','lx310ii'],['COLORED','colored']]},
];

const normalizeHeader = value => String(value ?? '').trim().toUpperCase().replace(/[._\-\s]+/g,' ').replace(/\s+/g,' ');
const headerMap = {
  'BRANCH NAME':'branchName','BRANCH TYPE':'branchType','COMPANY':'company','ACCOUNT NO':'accountNo','TEL NO':'telNo','CONTACT PERSON':'contactPerson','CONTACT NO':'contactNo','ADDRESS':'address','OIC':'oic','CONTACT NO 1':'contactNo1','ISP':'isp','CONN TYPE':'connType','PLAN':'plan','MONTHLY PAYMENT':'monthlyPayment','IP ADDRESS':'ipAddress','SUBNET MASK':'subnetMask','DEFAULT GATEWAY':'defaultGateway','DNS1':'dns1','DNS 1':'dns1','DNS2':'dns2','DNS 2':'dns2','NO OF COMP':'noOfComp','2175/2175II':'printer2175','LX 310II':'lx310ii','LX 310 II':'lx310ii','COLORED':'colored'
};

export default function Branches(){
  const {profile}=useAuth();
  const [branches,setBranches]=useState([]);
  const [form,setForm]=useState({...blank});
  const [editing,setEditing]=useState(null);
  const [search,setSearch]=useState('');
  const [typeFilter,setTypeFilter]=useState('ALL');
  const [companyFilter,setCompanyFilter]=useState('ALL');
  const [connFilter,setConnFilter]=useState('ALL');
  const [showModal,setShowModal]=useState(false);
  const [viewing,setViewing]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [showImport,setShowImport]=useState(false);
  const [importRows,setImportRows]=useState([]);
  const [importFile,setImportFile]=useState(null);
  const [importing,setImporting]=useState(false);
  const [importError,setImportError]=useState('');
  const [currentPage,setCurrentPage]=useState(1);
  const rowsPerPage=10;

  const load=async()=>{
    setLoading(true); setError('');
    try{
      const isSuper=profile?.role==='super_admin';
      const base=collection(db,'branches');
      const q=isSuper
        ? query(base,orderBy('createdAt','desc'))
        : profile?.groupId
          ? query(base,where('groupId','==',profile.groupId),orderBy('createdAt','desc'))
          : null;
      if(!q){ setBranches([]); return; }
      try{
        const snap=await getDocs(q);
        setBranches(snap.docs.map(d=>({id:d.id,...d.data()})));
      }catch(e){
        // Fall back to a group-scoped unordered read if the composite index is not ready.
        const fallback=isSuper ? base : query(base,where('groupId','==',profile.groupId));
        const snap=await getDocs(fallback);
        setBranches(snap.docs.map(d=>({id:d.id,...d.data()})));
      }
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const companies=useMemo(()=>[...new Set(branches.map(b=>String(b.company||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[branches]);
  const stats=useMemo(()=>({
    total:branches.length,
    full:branches.filter(b=>String(b.branchType).toUpperCase()==='FULL').length,
    sales:branches.filter(b=>String(b.branchType).toUpperCase()==='SALES OFFICE').length,
    staticIp:branches.filter(b=>String(b.connType).toLowerCase()==='static' && String(b.ipAddress||'').trim()).length,
  }),[branches]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return branches.filter(b=>{
      const hay=[b.branchName,b.branchType,b.company,b.accountNo,b.contactPerson,b.contactNo,b.isp,b.plan,b.ipAddress,b.address].join(' ').toLowerCase();
      return (!q||hay.includes(q)) && (typeFilter==='ALL'||String(b.branchType||'').toUpperCase()===typeFilter) && (companyFilter==='ALL'||String(b.company||'')===companyFilter) && (connFilter==='ALL'||String(b.connType||'').toLowerCase()===connFilter.toLowerCase());
    });
  },[branches,search,typeFilter,companyFilter,connFilter]);

  const totalPages=Math.max(1,Math.ceil(filtered.length/rowsPerPage));
  const paginated=useMemo(()=>{
    const safePage=Math.min(currentPage,totalPages);
    const start=(safePage-1)*rowsPerPage;
    return filtered.slice(start,start+rowsPerPage);
  },[filtered,currentPage,totalPages]);
  useEffect(()=>{setCurrentPage(1)},[search,typeFilter,companyFilter,connFilter]);
  useEffect(()=>{if(currentPage>totalPages)setCurrentPage(totalPages)},[currentPage,totalPages]);

  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const reset=()=>{setForm({...blank});setEditing(null);setEditingBranch(null);setError('')};
  const openAdd=()=>{reset();setShowModal(true)};
  const [editingBranch,setEditingBranch]=useState(null);
  const openEdit=b=>{setEditingBranch(b);setEditing(b.id);setForm({...blank,...b,monthlyPayment:b.monthlyPayment??'',noOfComp:b.noOfComp??'',branchType:b.branchType||'',connType:b.connType||'Static'});setError('');setShowModal(true)};

  const submit=async e=>{
    e.preventDefault(); setSaving(true); setError('');
    const name=form.branchName.trim();
    const duplicate=branches.some(b=>b.id!==editing && String(b.branchName||'').trim().toLowerCase()===name.toLowerCase());
    if(duplicate){setError('May existing branch record na kapareho ng BRANCH NAME.');setSaving(false);return;}
    try{
      const payload={...form,branchName:name,branchType:String(form.branchType).toUpperCase(),connType:form.connType||'Static',monthlyPayment:form.monthlyPayment?Number(form.monthlyPayment):0,noOfComp:form.noOfComp?Number(form.noOfComp):0,groupId:editing ? (editingBranch?.groupId || profile?.groupId || '') : (profile?.groupId || ''),groupName:editing ? (editingBranch?.groupName || profile?.groupName || '') : (profile?.groupName || ''),updatedAt:serverTimestamp()};
      if(editing){
        await updateDoc(doc(db,'branches',editing),payload);
        await audit({action:'UPDATE_BRANCH',details:`Updated branch ${name}`,targetUserId:editing});
      }else{
        const ref=await addDoc(collection(db,'branches'),{...payload,createdAt:serverTimestamp()});
        await audit({action:'CREATE_BRANCH',details:`Created branch ${name}`,targetUserId:ref.id});
      }
      reset(); setShowModal(false); await load();
    }catch(e){setError(e.message || 'Unable to save branch.')}finally{setSaving(false)}
  };

  const remove=async b=>{
    if(!confirm(`Delete branch ${b.branchName||'record'}? This action cannot be undone.`))return;
    try{await deleteDoc(doc(db,'branches',b.id));await audit({action:'DELETE_BRANCH',details:`Deleted branch ${b.branchName||b.id}`,targetUserId:b.id});await load()}
    catch(e){setError(e.message || 'Unable to delete branch.')}
  };

  const toImportRow=row=>{
    const out={...blank};
    Object.entries(row).forEach(([key,value])=>{const mapped=headerMap[normalizeHeader(key)];if(mapped)out[mapped]=value==null?'':String(value).trim()});
    if(!out.connType)out.connType='Static';
    out.branchType=String(out.branchType||'').toUpperCase();
    out.monthlyPayment=out.monthlyPayment?Number(String(out.monthlyPayment).replace(/[^0-9.-]/g,''))||0:0;
    out.noOfComp=out.noOfComp?Number(String(out.noOfComp).replace(/[^0-9.-]/g,''))||0:0;
    return out;
  };

  const handleImportFile=async event=>{
    const file=event.target.files?.[0]; if(!file)return;
    setImportFile(file);setImportError('');setImportRows([]);
    try{
      const data=await file.arrayBuffer();
      const workbook=XLSX.read(data,{type:'array'});
      const sheet=workbook.Sheets[workbook.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
      const mapped=rows.map(toImportRow).filter(r=>Object.values(r).some(v=>String(v??'').trim()!==''));
      if(!mapped.length)throw new Error('Walang valid rows sa Excel/CSV file.');
      const invalid=mapped.findIndex(r=>!r.branchName||!['FULL','SALES OFFICE'].includes(r.branchType));
      if(invalid>=0)throw new Error(`Row ${invalid+2}: kailangan ang BRANCH NAME at BRANCH TYPE (FULL o SALES OFFICE).`);
      setImportRows(mapped);
    }catch(e){setImportError(e.message||'Hindi mabasa ang file.')}
    event.target.value='';
  };

  const importBranches=async()=>{
    if(!importRows.length)return;
    setImporting(true);setImportError('');
    try{
      const existing=new Set(branches.map(b=>String(b.branchName||'').trim().toLowerCase()).filter(Boolean));
      const incomingSeen=new Set();
      const duplicates=importRows.filter(r=>{const k=r.branchName.trim().toLowerCase();if(existing.has(k)||incomingSeen.has(k))return true;incomingSeen.add(k);return false});
      if(duplicates.length)throw new Error(`May duplicate BRANCH NAME sa import: ${duplicates.slice(0,5).map(r=>r.branchName).join(', ')}${duplicates.length>5?'...':''}`);
      for(let i=0;i<importRows.length;i+=450){
        const batch=writeBatch(db);
        importRows.slice(i,i+450).forEach(row=>{const ref=doc(collection(db,'branches'));batch.set(ref,{...row,groupId:profile?.groupId||'',groupName:profile?.groupName||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()})});
        await batch.commit();
      }
      await audit({action:'IMPORT_BRANCHES',details:`Imported ${importRows.length} branch records from ${importFile?.name||'Excel/CSV'}`});
      setImportRows([]);setImportFile(null);setShowImport(false);await load();
    }catch(e){setImportError(e.message||'Hindi ma-import ang branches.')}finally{setImporting(false)}
  };

  const exportBranches=async()=>{
    const rows=filtered.map(b=>({
      'BRANCH NAME':b.branchName||'',
      'BRANCH TYPE':b.branchType||'',
      'COMPANY':b.company||'',
      'ACCOUNT NO.':b.accountNo||'',
      'TEL. NO.':b.telNo||'',
      'CONTACT PERSON':b.contactPerson||'',
      'CONTACT NO.':b.contactNo||'',
      'ADDRESS':b.address||'',
      'OIC':b.oic||'',
      'CONTACT NO._1':b.contactNo1||'',
      'ISP':b.isp||'',
      'CONN_TYPE':b.connType||'',
      'PLAN':b.plan||'',
      'MONTHLY PAYMENT':b.monthlyPayment??'',
      'IP ADDRESS':b.ipAddress||'',
      'SUBNET MASK':b.subnetMask||'',
      'DEFAULT GATEWAY':b.defaultGateway||'',
      'DNS1':b.dns1||'',
      'DNS2':b.dns2||'',
      'NO. OF COMP.':b.noOfComp??'',
      '2175/2175II':b.printer2175||'',
      'LX-310II':b.lx310ii||'',
      'COLORED':b.colored||'',
      'GROUP':b.groupName||''
    }));
    if(!rows.length){setError('Walang branch records na maaaring i-export.');return;}
    const ws=XLSX.utils.json_to_sheet(rows);
    ws['!cols']=Object.keys(rows[0]).map(k=>({wch:Math.min(Math.max(k.length+2,14),30)}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Branches');
    const stamp=new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb,`EDP_Branches_${stamp}.xlsx`);
    try{await audit({action:'EXPORT_BRANCHES',details:`Exported ${rows.length} branch records to Excel`})}catch(e){console.warn('Audit export failed',e)}
  };

  const clearFilters=()=>{setSearch('');setTypeFilter('ALL');setCompanyFilter('ALL');setConnFilter('ALL')};
  const activeFilters=Boolean(search||typeFilter!=='ALL'||companyFilter!=='ALL'||connFilter!=='ALL');

  const fieldControl=(key,label,type='text',required=false)=>{
    if(type==='select')return <select value={form[key]} onChange={e=>change(key,e.target.value)} required={required}><option value="">Select branch type</option><option value="FULL">FULL</option><option value="SALES OFFICE">SALES OFFICE</option></select>;
    if(type==='conn')return <select value={form[key]} onChange={e=>change(key,e.target.value)}><option value="Static">Static</option><option value="Dynamic">Dynamic</option></select>;
    if(type==='textarea')return <textarea value={form[key]} onChange={e=>change(key,e.target.value)} required={required} rows={3}/>;
    return <input type={type==='number'?'number':'text'} min={type==='number'?'0':undefined} step={key==='monthlyPayment'?'0.01':undefined} value={form[key]} onChange={e=>change(key,e.target.value)} required={required} />;
  };

  return <section>
    <div className="page-title-row branch-page-heading">
      <div><p className="eyebrow">SUPER ADMINISTRATION</p><h1>Branch Management</h1><p className="subtext">Centralized branch, contact, connectivity, and equipment records.</p></div>
      <div className="page-actions"><button className="ghost-btn" type="button" onClick={exportBranches}>⇩ Export Excel</button><button className="ghost-btn" type="button" onClick={()=>{setImportRows([]);setImportFile(null);setImportError('');setShowImport(true)}}>⇧ Import Branches</button><button className="amber-btn" type="button" onClick={openAdd}>+ Add Branch</button></div>
    </div>

    {error&&!showModal&&!showImport&&<p className="error branch-page-error">{error}</p>}

    <div className="branch-stat-grid">
      <div className="branch-stat-card"><span>TOTAL BRANCHES</span><strong>{stats.total}</strong><small>All records</small></div>
      <div className="branch-stat-card"><span>FULL</span><strong>{stats.full}</strong><small>Full branches</small></div>
      <div className="branch-stat-card"><span>SALES OFFICE</span><strong>{stats.sales}</strong><small>Sales offices</small></div>
      <div className="branch-stat-card"><span>STATIC IP</span><strong>{stats.staticIp}</strong><small>With IP address</small></div>
    </div>

    <div className="branch-toolbar content-card">
      <div className="branch-search search-wrap"><span>⌕</span><input aria-label="Search branches" placeholder="Search branch, company, account no., contact, ISP, or IP..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="branch-filters">
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} aria-label="Filter branch type"><option value="ALL">All Types</option><option value="FULL">FULL</option><option value="SALES OFFICE">SALES OFFICE</option></select>
        <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} aria-label="Filter company"><option value="ALL">All Companies</option>{companies.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select value={connFilter} onChange={e=>setConnFilter(e.target.value)} aria-label="Filter connection type"><option value="ALL">All Connections</option><option value="Static">Static</option><option value="Dynamic">Dynamic</option></select>
        {activeFilters&&<button className="clear-filter-btn" type="button" onClick={clearFilters}>Clear</button>}
      </div>
    </div>

    <div className="branch-list-head"><div><strong>Branch Records</strong><span>{filtered.length} shown of {branches.length}</span></div><span className="branch-list-note">Use View for complete connectivity details.</span></div>
    <div className="content-card table-wrap branch-table">
      <table><thead><tr><th>BRANCH NAME</th><th>TYPE</th><th>COMPANY</th><th>ACCOUNT NUMBER</th><th>ACTIONS</th></tr></thead>
        <tbody>{paginated.map(b=><tr key={b.id}>
          <td><div className="branch-name-cell"><b>{b.branchName||'—'}</b></div></td>
          <td><span className={`branch-type-badge ${String(b.branchType||'').toLowerCase().replace(/\s+/g,'-')}`}>{b.branchType||'—'}</span></td>
          <td>{b.company||'—'}</td><td>{b.accountNo||'—'}</td>
          <td><div className="actions"><button className="link-btn view-link" type="button" onClick={()=>setViewing(b)}>View</button><button className="link-btn" type="button" onClick={()=>openEdit(b)}>Edit</button><button className="link-btn danger-link" type="button" onClick={()=>remove(b)}>Delete</button></div></td>
        </tr>)}</tbody>
      </table>
      {!loading&&filtered.length>0&&<div className="branch-pagination">
        <span>Showing <b>{(currentPage-1)*rowsPerPage+1}</b>–<b>{Math.min(currentPage*rowsPerPage,filtered.length)}</b> of <b>{filtered.length}</b></span>
        <div className="pagination-controls">
          <button className="ghost-btn pagination-btn" type="button" disabled={currentPage===1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))}>Previous</button>
          <span className="page-number">Page {currentPage} of {totalPages}</span>
          <button className="ghost-btn pagination-btn" type="button" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}>Next</button>
        </div>
      </div>}
      {!loading&&!filtered.length&&<div className="branch-empty"><div className="branch-empty-icon">⌕</div><strong>{branches.length?'No matching branches':'No branch records yet'}</strong><p>{branches.length?'Try changing your search or filters.':'Add your first branch or import records from Excel/CSV.'}</p>{activeFilters?<button className="ghost-btn" type="button" onClick={clearFilters}>Clear Filters</button>:<button className="amber-btn" type="button" onClick={openAdd}>+ Add Branch</button>}</div>}
      {loading&&<div className="branch-empty"><strong>Loading branches...</strong><p>Please wait while records are loaded from Firebase.</p></div>}
    </div>

    {showModal&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget){reset();setShowModal(false)}}}>
      <div className="branch-modal branch-editor-modal" role="dialog" aria-modal="true" aria-labelledby="branch-modal-title">
        <div className="modal-header"><div><p className="eyebrow">BRANCH RECORD</p><h2 id="branch-modal-title">{editing?'Edit Branch':'Add Branch'}</h2><p className="subtext">Complete the branch profile below. Required fields are marked by the browser.</p></div><button className="modal-close" type="button" aria-label="Close" onClick={()=>{reset();setShowModal(false)}}>×</button></div>
        <div className="modal-body">
          <form className="branch-form" onSubmit={submit}>
            {sections.map(section=><div className="branch-form-section" key={section.title}><div className="branch-section-title"><span>{section.title}</span><i/></div><div className="branch-form-grid">{section.fields.map(([key,label,type,required])=><label key={key} className={type==='textarea'?'field-wide':''}>{label}{fieldControl(key,label,type,required)}</label>)}</div></div>)}
            {error&&<p className="error modal-error">{error}</p>}
            <div className="branch-form-actions"><button className="ghost-btn" type="button" onClick={()=>{reset();setShowModal(false)}}>Cancel</button><button className="amber-btn" type="submit" disabled={saving}>{saving?'Saving...':editing?'Save Changes':'Add Branch'}</button></div>
          </form>
        </div>
      </div>
    </div>}

    {viewing&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setViewing(null)}}>
      <div className="branch-modal details-modal" role="dialog" aria-modal="true" aria-labelledby="branch-details-title">
        <div className="modal-header branch-details-header"><div><p className="eyebrow">BRANCH RECORD</p><div className="details-title-row"><h2 id="branch-details-title">{viewing.branchName||'Branch Details'}</h2><span className={`branch-type-badge ${String(viewing.branchType||'').toLowerCase().replace(/\s+/g,'-')}`}>{viewing.branchType||'—'}</span></div><p className="subtext">Complete branch, contact, connectivity, and equipment information.</p></div><button className="modal-close" type="button" aria-label="Close" onClick={()=>setViewing(null)}>×</button></div>
        <div className="modal-body"><div className="details-grid">
          {detailSections.map(section=><div className="details-section" key={section.title}><div className="details-section-title">{section.title}</div><div className="details-items">{section.fields.map(([label,key])=>{const raw=viewing[key];const value=key==='monthlyPayment'&&raw!==''&&raw!=null?`₱${Number(raw).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:(raw||'—');return <div className={`detail-item ${key==='address'?'detail-wide':''}`} key={label}><span>{label}</span><strong>{value}</strong></div>})}</div></div>)}
        </div><div className="details-actions"><button className="ghost-btn" type="button" onClick={()=>setViewing(null)}>Close</button><button className="amber-btn" type="button" onClick={()=>{const b=viewing;setViewing(null);openEdit(b)}}>Edit Branch</button></div></div>
      </div>
    </div>}

    {showImport&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowImport(false)}}>
      <div className="branch-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-branches-title">
        <div className="modal-header"><div><p className="eyebrow">BULK DATA ENTRY</p><h2 id="import-branches-title">Import Branches</h2><p className="subtext">Upload Excel (.xlsx/.xls) or CSV and review the records before writing to Firestore.</p></div><button className="modal-close" type="button" aria-label="Close" onClick={()=>setShowImport(false)}>×</button></div>
        <div className="modal-body">
          <div className="import-help"><div className="import-help-title">Import requirements</div><p><b>Required:</b> BRANCH NAME and BRANCH TYPE. BRANCH TYPE must be <b>FULL</b> or <b>SALES OFFICE</b>.</p><div className="import-column-list">BRANCH NAME · BRANCH TYPE · COMPANY · ACCOUNT NO. · TEL. NO. · CONTACT PERSON · CONTACT NO. · ADDRESS · OIC · CONTACT NO._1 · ISP · CONN_TYPE · PLAN · MONTHLY PAYMENT · IP ADDRESS · SUBNET MASK · DEFAULT GATEWAY · DNS1 · DNS2 · NO. OF COMP. · 2175/2175II · LX-310II · COLORED</div></div>
          <label className="file-picker"><span>{importFile?importFile.name:'Choose Excel or CSV file'}</span><input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleImportFile}/></label>
          {importError&&<p className="error modal-error">{importError}</p>}
          {importRows.length>0&&<><div className="import-summary"><div><b>{importRows.length}</b> records ready</div><small>Previewing up to 8 rows</small></div><div className="content-card table-wrap import-preview"><table><thead><tr><th>BRANCH NAME</th><th>TYPE</th><th>COMPANY</th><th>ACCOUNT NO.</th><th>ISP</th><th>PLAN</th></tr></thead><tbody>{importRows.slice(0,8).map((r,i)=><tr key={i}><td>{r.branchName}</td><td>{r.branchType}</td><td>{r.company||'—'}</td><td>{r.accountNo||'—'}</td><td>{r.isp||'—'}</td><td>{r.plan||'—'}</td></tr>)}</tbody></table></div></>}
          <div className="branch-form-actions"><button className="ghost-btn" type="button" onClick={()=>setShowImport(false)}>Cancel</button><button className="amber-btn" type="button" disabled={!importRows.length||importing} onClick={importBranches}>{importing?'Importing...':`Import ${importRows.length||''} Branches`}</button></div>
        </div>
      </div>
    </div>}
  </section>;
}
