import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { usePagination, TablePagination } from '../components/TablePagination';

export default function AuditLogs(){
  const [logs,setLogs]=useState([]);
  useEffect(()=>{
    getDocs(query(collection(db,'auditLogs'),orderBy('createdAt','desc'),limit(100)))
      .then(s=>setLogs(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  const {pageItems,page,setPage,totalPages,pageSize}=usePagination(logs,10);

  return <section>
    <div className="page-title-row">
      <div><p className="eyebrow">SECURITY</p><h1>Audit Logs</h1></div>
      <span className="count-label">Latest 100 activities</span>
    </div>
    <div className="content-card table-wrap">
      <table>
        <thead><tr><th>DATE</th><th>USER</th><th>ACTION</th><th>DETAILS</th></tr></thead>
        <tbody>
          {pageItems.map(l=><tr key={l.id}>
            <td>{l.createdAt?.toDate?.().toLocaleString()||'—'}</td>
            <td>{l.userName||'—'}</td>
            <td><span className="role-tag">{l.action}</span></td>
            <td>{l.details}</td>
          </tr>)}
        </tbody>
      </table>
      {!logs.length&&<div className="empty-state">No audit logs yet.</div>}
      <TablePagination page={page} setPage={setPage} totalPages={totalPages} totalItems={logs.length} pageSize={pageSize}/>
    </div>
  </section>
}
