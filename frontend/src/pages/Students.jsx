import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTableRow } from '../components/Skeleton';

export default function Students() {
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState('id');
  const [dir, setDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, id: null, name: '' });

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        sort,
        dir,
        page,
        size: pageSize,
      });
      const data = await api.get(`/students?${params}`);
      setRows(data.rows);
      setColumns(data.columns);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      addFlash(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, sort, dir, page, pageSize, addFlash]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleSort = (col) => {
    if (sort === col) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setDir('asc');
    }
    setPage(1);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(e.currentTarget.elements.q.value);
    setPage(1);
  };

  const handleDelete = (id, name) => {
    setConfirmDialog({ open: true, id, name });
  };

  const confirmDelete = async () => {
    const { id, name } = confirmDialog;
    try {
      await api.delete(`/students/${id}/delete`);
      addFlash(`Student "${name}" deleted successfully.`, 'success');
      fetchStudents();
    } catch (err) {
      addFlash(err.message, 'error');
    }
    setConfirmDialog({ open: false, id: null, name: '' });
  };

  const formatCell = (row, col) => {
    const val = row[col.name];
    if (val === null || val === undefined) {
      return <span className="text-gray-300 italic">—</span>;
    }
    if (col.inferredType === 'boolean') {
      return val ? (
        <span className="badge badge-success">Yes</span>
      ) : (
        <span className="badge badge-gray">No</span>
      );
    }
    if (col.inferredType === 'date' || col.inferredType === 'datetime') {
      return new Date(val).toLocaleDateString();
    }
    return String(val);
  };

  const generatePageButtons = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Students</h2>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <input
              type="search"
              name="q"
              value={search}
              placeholder="Search students..."
              className="flex-1 input"
              aria-label="Search students"
            />
            <button type="submit" className="btn-primary">Search</button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1); }}
                className="btn-secondary"
              >
                Clear
              </button>
            )}
          </form>
          <Link to="/students/new" className="btn-success">
            + Add Student
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6">
            <div className="h-8 bg-gray-200 rounded w-32 animate-shimmer mb-4" aria-hidden="true" />
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <SkeletonTableRow key={i} columns={columns.length || 5} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.name}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-primary-600 transition-colors"
                        onClick={() => handleSort(col.name)}
                      >
                        <span className="flex items-center gap-1">
                          {col.displayLabel}
                          {sort === col.name && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                            </svg>
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                        <div className="text-gray-400 mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                        </div>
                        <p className="text-gray-500 font-medium">
                          No students found{search ? ' matching your search' : ''}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {search ? 'Try different search terms' : 'Add your first student to get started'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        {columns.map((col) => (
                          <td key={col.name} className="px-4 py-3 text-sm text-gray-900">
                            {formatCell(row, col)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/students/${row.id}/edit`}
                              className="btn-ghost"
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDelete(row.id, row.student_id || row.id)}
                              className="btn-danger"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  Showing page {page} of {totalPages} ({total} total)
                </div>
                <nav className="flex items-center gap-2" aria-label="Pagination">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Previous
                  </button>

                  {generatePageButtons().map((p) => (
                    p === '...' ? (
                      <span key="ellipsis" className="px-2 text-gray-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                          p === page
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  ))}

                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}

            {totalPages <= 1 && (
              <div className="p-4 border-t border-gray-200 text-sm text-gray-600">
                {total} student{total !== 1 ? 's' : ''} total
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, id: null, name: '' })}
        onConfirm={confirmDelete}
        title="Delete Student"
        message={`Are you sure you want to delete student "${confirmDialog.name}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}