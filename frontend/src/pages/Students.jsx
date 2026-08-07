import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTableRow } from '../components/Skeleton';
import { renderIcon } from '../components/IconMap';

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
  const [aiEvalModal, setAiEvalModal] = useState({ open: false, student: null });
  const [aiEvalResult, setAiEvalResult] = useState(null);
  const [aiEvalLoading, setAiEvalLoading] = useState(false);

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
      await api.post(`/students/${id}/delete`);
      addFlash(`Student "${name}" deleted successfully.`, 'success');
      fetchStudents();
    } catch (err) {
      addFlash(err.message, 'error');
    }
    setConfirmDialog({ open: false, id: null, name: '' });
  };

  const handleAiEval = async (student) => {
    setAiEvalModal({ open: true, student });
    setAiEvalResult(null);
    setAiEvalLoading(true);

    try {
      // Map student data to the feedback API fields
      const input = {
        gender: student.gender || 'Female',
        age: student.age || 20,
        study_hours_per_day: student.study_hours_per_day || 4,
        attendance_percent: student.attendance_percent || 85,
        sleep_hours: student.sleep_hours || 7,
        previous_gpa: student.previous_gpa || 3.0,
        parental_education: student.parental_education || 'Bachelors',
        internet_access: student.internet_access || 'Yes',
        extracurricular: student.extracurricular || 'Yes',
        part_time_job: student.part_time_job || 'No',
      };
      const result = await api.post('/feedback', input);
      setAiEvalResult(result);
    } catch (err) {
      addFlash(err.message, 'error');
      setAiEvalModal({ open: false, student: null });
    } finally {
      setAiEvalLoading(false);
    }
  };

  const handleApplyToNotes = async () => {
    if (!aiEvalResult?.feedback?.text || !aiEvalModal.student) return;
    try {
      await api.post(`/students/${aiEvalModal.student.id}`, {
        notes: aiEvalResult.feedback.text,
      });
      addFlash('AI evaluation applied to notes!', 'success');
      setAiEvalModal({ open: false, student: null });
      setAiEvalResult(null);
      fetchStudents();
    } catch (err) {
      addFlash(err.message, 'error');
    }
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
        <h2 className="text-xl font-bold text-primary-950 dark:text-gray-100">Students</h2>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <input
              type="search"
              name="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
            <div className="h-8 bg-primary-100 dark:bg-gray-700 rounded-xl w-32 animate-shimmer mb-4" aria-hidden="true" />
            <table className="w-full">
              <tbody className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <SkeletonTableRow key={i} columns={columns.length || 5} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-50/60 dark:bg-gray-900 border-b border-primary-100 dark:border-gray-800">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.name}
                        className="table-header-th"
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
                    <th className="table-header-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-gray-800">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                        <div className="text-primary-300 dark:text-gray-600 mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                        </div>
                        <p className="text-primary-400 dark:text-gray-500 font-medium">
                          No students found{search ? ' matching your search' : ''}
                        </p>
                        <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                          {search ? 'Try different search terms' : 'Add your first student to get started'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-primary-50/50 dark:hover:bg-gray-800/50 transition-colors">
                        {columns.map((col) => (
                          <td key={col.name} className="px-4 py-3 text-sm text-primary-950 dark:text-gray-200">
                            {formatCell(row, col)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleAiEval(row)}
                              className="btn-ghost text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30"
                              title="AI Evaluate"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548-.548A3.374 3.374 0 0014 14.469V17a1 1 0 01-.553.894l-.491.246a1.5 1.5 0 00-.553 1.679l.216.871a2 2 0 01-1.935 2.41H13.5" />
                              </svg>
                            </button>
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
              <div className="p-4 border-t border-primary-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-primary-500 dark:text-gray-400">
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
                      <span key="ellipsis" className="px-2 text-primary-300 dark:text-gray-600">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-xl transition-colors ${
                          p === page
                            ? 'bg-primary-600 text-white shadow-clay-sm'
                            : 'text-primary-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-primary-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-gray-700'
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
              <div className="p-4 border-t border-primary-100 dark:border-gray-800 text-sm text-primary-500 dark:text-gray-400">
                {total} student{total !== 1 ? 's' : ''} total
              </div>
            )}
          </>
        )}
      </div>

      {/* AI Eval Modal */}
      {aiEvalModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setAiEvalModal({ open: false, student: null })}>
          <div className="card max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-primary-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-primary-950 dark:text-gray-100">
                AI Evaluation — Student #{aiEvalModal.student?.id}
              </h3>
              <button
                onClick={() => setAiEvalModal({ open: false, student: null })}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {aiEvalLoading ? (
                <div className="space-y-3">
                  <div className="h-6 bg-primary-100 dark:bg-gray-700 rounded-xl w-3/4 animate-shimmer" />
                  <div className="h-4 bg-primary-100 dark:bg-gray-700 rounded-xl w-full animate-shimmer" />
                  <div className="h-4 bg-primary-100 dark:bg-gray-700 rounded-xl w-5/6 animate-shimmer" />
                  <div className="h-20 bg-primary-100 dark:bg-gray-700 rounded-xl w-full animate-shimmer" />
                </div>
              ) : aiEvalResult ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-primary-50/60 dark:bg-gray-800 rounded-2xl text-center">
                      <p className="text-xs font-semibold text-primary-400 dark:text-gray-400 uppercase tracking-wider">Predicted Score</p>
                      <p className="text-3xl font-bold text-primary-950 dark:text-gray-100 mt-1">
                        {aiEvalResult.final_score?.toFixed(1)}
                      </p>
                    </div>
                    <div className="p-4 bg-primary-50/60 dark:bg-gray-800 rounded-2xl text-center">
                      <p className="text-xs font-semibold text-primary-400 dark:text-gray-400 uppercase tracking-wider">Predicted Grade</p>
                      <span className={`inline-block mt-1 px-4 py-1 rounded-full text-xl font-bold ${
                        {A:'bg-green-500 text-white',B:'bg-blue-500 text-white',C:'bg-yellow-500 text-white',D:'bg-orange-500 text-white',F:'bg-red-500 text-white'}[aiEvalResult.grade] || 'bg-gray-400 text-white'
                      }`}>
                        {aiEvalResult.grade}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-2">Recommendations</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(aiEvalResult.feedback?.recommendations || []).map((rec, i) => (
                        <div key={i} className={`flex gap-2 p-2.5 border-l-3 rounded-r text-sm ${{
                          success: 'border-green-500 bg-green-50 dark:bg-green-900/30',
                          warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30',
                          danger: 'border-red-500 bg-red-50 dark:bg-red-900/30',
                          info: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
                        }[rec.severity] || 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'}`}>
                          <span className="flex-shrink-0">{renderIcon(rec.icon, { className: 'w-5 h-5' })}</span>
                          <span className="text-primary-700 dark:text-gray-300">{rec.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-3 border-t border-primary-100 dark:border-gray-700">
                    <button
                      onClick={handleApplyToNotes}
                      className="btn-primary flex-1"
                    >
                      Apply to Notes
                    </button>
                    <button
                      onClick={() => setAiEvalModal({ open: false, student: null })}
                      className="btn-secondary"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

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