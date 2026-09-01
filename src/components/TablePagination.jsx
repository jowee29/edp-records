import { useEffect, useMemo, useState } from 'react';

export function usePagination(items, pageSize = 10){
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage(p => Math.min(Math.max(1, p), totalPages));
  }, [items.length, totalPages]);
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);
  return { pageItems, page, setPage, totalPages, pageSize };
}

export function TablePagination({ page, setPage, totalPages, totalItems, pageSize = 10 }){
  if (!totalItems) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  return <div className="table-pagination" aria-label="Table pagination">
    <span className="pagination-info">Showing {start}–{end} of {totalItems}</span>
    <div className="pagination-controls">
      <button type="button" className="pagination-btn" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button>
      <span className="pagination-page">Page {page} of {totalPages}</span>
      <button type="button" className="pagination-btn" disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button>
    </div>
  </div>;
}
