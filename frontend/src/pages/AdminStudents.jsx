import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  Brain,
  Edit,
  Trash2,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Check,
  CheckCheck,
  Target,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatAdminMetric } from '../utils/adminAiTools.js';

const SORT_OPTIONS = [
  { value: 'student_id', label: 'Student ID' },
  { value: 'final_score', label: 'Final Score' },
  { value: 'attendance_percent', label: 'Attendance' },
  { value: 'previous_gpa', label: 'GPA' },
  { value: 'study_hours_per_day', label: 'Study Hours' },
  { value: 'sleep_hours', label: 'Sleep Hours' },
  { value: 'created_at', label: 'Date Added' },
];

const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const PART_TIME_JOB_OPTIONS = ['Yes', 'No'];
const PARENTAL_EDU_OPTIONS = ['High School', 'Bachelor', 'Master', 'PhD', 'None'];

function RiskBadge({ riskLevel }) {
  const { t } = useLanguage();
  const styles = {
    high: 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300',
    medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    low: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300',
    unknown: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
  };
  const riskLabels = {
    high: t('admin.highRisk'),
    medium: t('admin.mediumRisk'),
    low: t('admin.lowRisk'),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[riskLevel] || styles.unknown}`}>
      {riskLabels[riskLevel] || t('admin.unknown')}
    </span>
  );
}

function GradeBadge({ grade }) {
  const styles = {
    A: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    B: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
    C: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    D: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    F: 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${styles[grade] || 'bg-surface-muted text-ink-muted'}`}>
      {GRADE_OPTIONS.includes(grade) ? grade : '—'}
    </span>
  );
}

function SelectFilter({ label, value, options, onChange, placeholder = 'All' }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-primary-600 dark:text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

export default function AdminStudents() {
  const navigate = useNavigate();
  const { addFlash } = useFlash();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('final_score');
  const [dir, setDir] = useState('desc');
  const [filters, setFilters] = useState({
    grade: '',
    gender: '',
    part_time_job: '',
    parental_education: '',
    at_risk: '',
  });
  const [filterOptions, setFilterOptions] = useState({
    grades: [],
    genders: [],
    partTimeJobs: [],
    parentalEducation: [],
  });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAllPage, setSelectAllPage] = useState(false);
  const selectAllRef = useRef(null);
  const [showFilters, setShowFilters] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
        sort,
        dir,
      });
      if (search) params.append('q', search);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const data = await api.get(`/admin/students?${params.toString()}`);
      // Backend apiAdminListStudents returns { rows, total, ... }; tolerate either key.
      setStudents(data.rows || data.students || []);
      setTotal(data.total || 0);
      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.studentsLoadFailed') });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, dir, search, filters, addFlash, t]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleSort = (column) => {
    if (sort === column) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setDir('asc');
    }
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      grade: '',
      gender: '',
      part_time_job: '',
      parental_education: '',
      at_risk: '',
    });
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const handleSelectAll = () => {
    if (selectAllPage) {
      setSelectedIds(new Set());
    } else {
      const newIds = new Set(students.map(s => s.id));
      setSelectedIds(newIds);
    }
    setSelectAllPage(!selectAllPage);
  };

  const handleSelectOne = (id) => {
    // Compute next synchronously so both state updates share it. The previous
    // version referenced a block-scoped `next` from inside the setSelectedIds
    // updater, which threw ReferenceError on every single-row checkbox click.
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    setSelectAllPage(students.length > 0 && students.every(s => next.has(s.id)));
  };

  const handleBulkExport = async () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : null;
    try {
      setActionLoading('export');
      const response = await fetch('/api/admin/students/bulk-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, filters: ids ? null : filters }),
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      addFlash({ type: 'success', message: t('admin.exportCompleted') });
    } catch (err) {
      addFlash({ type: 'error', message: t('admin.exportFailed') });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkAiEvaluate = async () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : null;
    if (!ids || ids.length === 0) {
      addFlash({ type: 'error', message: t('admin.selectStudentsFirst') });
      return;
    }
    if (ids.length > 50) {
      addFlash({ type: 'error', message: t('admin.maxStudents') });
      return;
    }
    try {
      setActionLoading('ai');
      const data = await api.post('/admin/students/bulk-ai-evaluate', { ids });
      addFlash({ type: 'success', message: t('admin.aiEvalCompleted', { count: data.processed }) });
      fetchStudents();
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.bulkEvalFailed') });
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerateIntervention = async (studentId) => {
    try {
      setActionLoading(`intervention-${studentId}`);
      const data = await api.post(`/admin/students/${studentId}/intervention`);
      addFlash({ type: 'success', message: t('admin.interventionGenerated') });
      fetchStudents();
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.interventionFailed') });
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Imperatively sync the "indeterminate" state of the select-all checkbox.
  // React does NOT support `indeterminate` as a declarative prop on <input type="checkbox">;
  // it must be set via a ref. This effect runs whenever selectedIds or selectAllPage changes.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && !selectAllPage;
    }
  }, [selectedIds, selectAllPage]);

  const handleDelete = async (studentId) => {
    setConfirmDialog({
      title: t('students.deleteStudent'),
      message: t('admin.deleteStudentConfirm'),
      onConfirm: async () => {
        try {
          await api.post(`/admin/students/${studentId}/delete`);
          addFlash({ type: 'success', message: t('admin.studentDeleted') });
          fetchStudents();
        } catch (err) {
          if (err instanceof ApiError) {
            addFlash({ type: 'error', message: err.message });
          } else {
            addFlash({ type: 'error', message: t('admin.studentDeleteFailed') });
          }
        }
      },
    });
  };

  const handleEdit = (student) => {
    navigate(`/students/${student.id}/edit`);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 skeleton" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 skeleton" />
        ))}
      </div>
    );
  }

  const tableHeaders = [
    { key: 'student_id', label: t('admin.studentID') },
    { key: 'name', label: t('admin.name') },
    { key: 'grade', label: 'Grade' },
    { key: 'final_score', label: t('admin.finalScore') },
    { key: 'attendance_percent', label: t('admin.attendance') },
    { key: 'previous_gpa', label: t('admin.gpa') },
    { key: 'study_hours_per_day', label: t('admin.studyHours') },
    { key: 'sleep_hours', label: t('admin.sleepHours') },
    { key: 'part_time_job', label: t('admin.partTime') },
    { key: 'risk_level', label: t('admin.risk') },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">{t('admin.studentManagement')}</h1>
          <p className="text-primary-500 dark:text-gray-400 mt-1">{t('admin.studentsHeaderDesc')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
            <input
              type="text"
              placeholder={t('admin.searchPlaceholder')}
              value={search}
              onChange={handleSearch}
              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center gap-2 px-4"
          >
            <Filter className="w-4 h-4" />
            {t('admin.filters')} {hasActiveFilters && (
              <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs px-2 py-0.5 rounded-full">
                {Object.values(filters).filter(v => v).length}
              </span>
            )}
          </button>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 border-l border-primary-200 dark:border-gray-700 pl-4">
              <span className="text-sm text-primary-600 dark:text-gray-400">
                {selectedIds.size} {t('admin.selected')}
              </span>
              <button onClick={handleBulkExport} disabled={actionLoading === 'export'} className="btn-secondary text-xs flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                {t('common.exportCSV')}
              </button>
              <button onClick={handleBulkAiEvaluate} disabled={actionLoading === 'ai' || selectedIds.size > 50} className="btn-primary text-xs flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                {t('admin.bulkAiEvaluate')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Sidebar */}
      {showFilters && (
        <div className="card-clay p-4 animate-slide-down">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <SelectFilter label="Grade" value={filters.grade} options={filterOptions.grades?.length ? filterOptions.grades : GRADE_OPTIONS} onChange={(v) => handleFilterChange('grade', v)} />
            <SelectFilter label="Gender" value={filters.gender} options={filterOptions.genders?.length ? filterOptions.genders : GENDER_OPTIONS} onChange={(v) => handleFilterChange('gender', v)} />
            <SelectFilter label="Part-Time Job" value={filters.part_time_job} options={filterOptions.partTimeJobs?.length ? filterOptions.partTimeJobs : PART_TIME_JOB_OPTIONS} onChange={(v) => handleFilterChange('part_time_job', v)} />
            <SelectFilter label="Parental Education" value={filters.parental_education} options={filterOptions.parentalEducation?.length ? filterOptions.parentalEducation : PARENTAL_EDU_OPTIONS} onChange={(v) => handleFilterChange('parental_education', v)} />
            <SelectFilter label="At-Risk" value={filters.at_risk} options={['High', 'Medium', 'Low']} onChange={(v) => handleFilterChange('at_risk', v)} />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" />
              {t('admin.clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* Student Table */}
      <div className="card-clay overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-primary-50 dark:bg-gray-900/50 border-b border-primary-100 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={selectAllPage && students.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-primary-200 dark:border-gray-700 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                </th>
                {tableHeaders.map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider cursor-pointer hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {sort === col.key && (
                        dir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-gray-800">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-primary-500 dark:text-gray-400">
                    {t('admin.noStudentsFound')}
                  </td>
                </tr>
              ) : (
                students.map((student, index) => (
                  <tr key={student.id} className="hover:bg-primary-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student.id)}
                        onChange={() => handleSelectOne(student.id)}
                        className="w-4 h-4 rounded border-primary-200 dark:border-gray-700 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{student.student_id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-primary-950 dark:text-gray-100">{student.name || '—'}</div>
                      <div className="text-xs text-primary-500 dark:text-gray-400">
                        {student.gender}, Age {student.age}
                      </div>
                    </td>
                    <td className="px-4 py-3"><GradeBadge grade={student.grade} /></td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{formatAdminMetric(student.final_score, 1)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{formatAdminMetric(student.attendance_percent, 1, '%')}</td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{formatAdminMetric(student.previous_gpa, 2)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{formatAdminMetric(student.study_hours_per_day, 1)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{formatAdminMetric(student.sleep_hours, 1)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        student.part_time_job === 'Yes'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}>
                        {student.part_time_job}
                      </span>
                    </td>
                    <td className="px-4 py-3"><RiskBadge riskLevel={student.risk_level} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/students/${student.id}/goals`)}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-primary-600 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-primary-400 dark:hover:bg-primary-900/30"
                          title={t('goals.viewProgress')}
                          aria-label={t('goals.viewProgressAria', { name: student.name || student.student_id })}
                        >
                          <Target className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(student)}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-primary-600 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-primary-400 dark:hover:bg-primary-900/30"
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Edit className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateIntervention(student.id)}
                          disabled={actionLoading === `intervention-${student.id}`}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-violet-600 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-400 dark:hover:bg-violet-900/30"
                          title={t('admin.aiIntervention')}
                          aria-label={t('admin.aiIntervention')}
                        >
                          <Brain className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(student.id)}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-danger-600 transition-colors hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-danger-400 dark:hover:bg-danger-900/30"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-primary-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-primary-500 dark:text-gray-400">
              {t('admin.showing')} {((page - 1) * pageSize) + 1} {t('admin.to')} {Math.min(page * pageSize, total)} {t('admin.of')} {total} {t('admin.students')}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1 mx-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-xl text-sm font-medium transition-all ${
                        page === pageNum
                          ? 'bg-primary-600 text-white'
                          : 'text-primary-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page === totalPages}
                className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDialog && (
        <ConfirmDialog
          {...confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}