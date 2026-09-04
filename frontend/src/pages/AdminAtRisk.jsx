import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import {
  AlertTriangle,
  Brain,
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Settings,
  X,
} from 'lucide-react';
import { Button, Modal } from '../components/ui';
import { formatLabel } from '../utils/formatLabel';
import { formatAdminMetric } from '../utils/adminAiTools';
import { filterAndSortAtRiskStudents, paginateAtRiskStudents } from '../utils/adminAtRisk';

const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'];
const RISK_LEVELS = ['high', 'medium', 'low'];

function RiskBadge({ riskLevel }) {
  const { t } = useLanguage();
  const normalizedRisk = String(riskLevel || '').toLowerCase();
  const riskKey = ['high', 'medium', 'low'].includes(normalizedRisk)
    ? normalizedRisk
    : 'unknown';
  const styles = {
    high: 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300 border-danger-200 dark:border-danger-800',
    medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    low: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800',
    unknown: 'bg-surface-muted text-ink-muted border-divider',
  };
  const icons = {
    high: <AlertCircle className="size-3" aria-hidden="true" />,
    medium: <AlertTriangle className="size-3" aria-hidden="true" />,
    low: <CheckCircle className="size-3" aria-hidden="true" />,
    unknown: <AlertCircle className="size-3" aria-hidden="true" />,
  };
  const riskLabels = {
    high: t('admin.highRisk'),
    medium: t('admin.mediumRisk'),
    low: t('admin.lowRisk'),
    unknown: t('admin.unknown'),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles[riskKey]}`}>
      {icons[riskKey]}
      {riskLabels[riskKey]}
    </span>
  );
}

function RiskFactorTag({ factor }) {
  const factorStyles = {
    attendance: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    sleep: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    gpa: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    study_hours: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  };
  const style = factorStyles[factor] || 'bg-surface-muted text-ink-muted';

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${style}`}>
      {formatLabel(factor)}
    </span>
  );
}

function SelectFilter({ label, value, options, onChange, placeholder }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-divider bg-surface px-3 py-2 text-sm text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

export default function AdminAtRisk() {
  const { addFlash } = useFlash();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [rawStudents, setRawStudents] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('risk_score');
  const [dir, setDir] = useState('desc');
  const [filters, setFilters] = useState({
    grade: '',
    risk_level: '',
  });
  // Threshold parameters
  const [thresholds, setThresholds] = useState({
    attendance: 75,
    study_hours: 2,
    gpa: 2.5,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showInterventionModal, setShowInterventionModal] = useState(false);
  const [interventionNote, setInterventionNote] = useState('');
  const [generatingStudentId, setGeneratingStudentId] = useState(null);
  const fetchRequestRef = useRef(0);

  const fetchStudents = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        attendance: thresholds.attendance.toString(),
        study_hours: thresholds.study_hours.toString(),
        gpa: thresholds.gpa.toString(),
      });

      const data = await api.get(`/admin/at-risk?${params.toString()}`);
      if (requestId === fetchRequestRef.current) {
        setRawStudents(Array.isArray(data.students) ? data.students : []);
      }
    } catch (err) {
      if (requestId !== fetchRequestRef.current) return;

      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.atRiskLoadFailed') });
      }
    } finally {
      if (requestId === fetchRequestRef.current) setLoading(false);
    }
  }, [thresholds, addFlash, t]);

  useEffect(() => {
    fetchStudents();
    return () => {
      fetchRequestRef.current += 1;
    };
  }, [fetchStudents]);

  const filteredStudents = useMemo(
    () => filterAndSortAtRiskStudents(
      rawStudents,
      {
        search,
        grade: filters.grade,
        riskLevel: filters.risk_level,
      },
      sort,
      dir
    ),
    [rawStudents, search, filters, sort, dir]
  );
  const pagination = useMemo(
    () => paginateAtRiskStudents(filteredStudents, page, pageSize),
    [filteredStudents, page, pageSize]
  );
  const students = pagination.students;
  const total = pagination.total;

  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  const handleSort = (column) => {
    if (sort === column) {
      setDir((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setDir('asc');
    }
    setPage(1);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleThresholdChange = (key, value) => {
    setThresholds(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ grade: '', risk_level: '' });
    setPage(1);
  };

  const clearThresholds = () => {
    setThresholds({ attendance: 75, study_hours: 2, gpa: 2.5 });
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const closeInterventionModal = () => {
    setShowInterventionModal(false);
    setSelectedStudent(null);
    setInterventionNote('');
  };

  const handleGenerateIntervention = async (student) => {
    if (generatingStudentId !== null) return;

    setSelectedStudent(student);
    setGeneratingStudentId(student.id);
    try {
      const data = await api.post(`/admin/students/${student.id}/intervention`);
      setInterventionNote(data.interventionNote || t('admin.noInterventionGenerated'));
      setShowInterventionModal(true);
    } catch (err) {
      setSelectedStudent(null);
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.interventionFailed') });
      }
    } finally {
      setGeneratingStudentId(null);
    }
  };

  const handleExport = async () => {
    if (actionLoading !== null || filteredStudents.length === 0) return;

    try {
      setActionLoading('export');
      const response = await fetch('/api/admin/students/bulk-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: filteredStudents.map(s => s.id), filters: { ...filters, at_risk: 'true' } }),
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `at_risk_students_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      addFlash({ type: 'success', message: t('admin.atRiskExported') });
    } catch (err) {
      addFlash({ type: 'error', message: t('admin.failedAtRisk') });
    } finally {
      setActionLoading(null);
    }
  };

  const riskCounts = {
    high: rawStudents.filter(s => s.risk_level === 'high').length,
    medium: rawStudents.filter(s => s.risk_level === 'medium').length,
    low: rawStudents.filter(s => s.risk_level === 'low').length,
  };

  const tableColumns = [
    { key: 'student_id', label: t('admin.studentID') },
    { key: 'name', label: t('admin.name') },
    { key: 'grade', label: t('common.grade') },
    { key: 'risk_level', label: t('admin.riskLevel') },
    { key: 'risk_factors', label: t('admin.riskFactors') },
    { key: 'attendance_percent', label: t('admin.attendance') },
    { key: 'sleep_hours', label: t('admin.sleep') },
    { key: 'previous_gpa', label: t('admin.gpa') },
    { key: 'study_hours_per_day', label: t('admin.study') },
    { key: 'part_time_job', label: t('admin.partTime') },
  ];

  if (loading) {
    return (
      <div
        className="space-y-6"
        role="status"
        aria-live="polite"
        aria-label={t('common.loading')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card-clay p-6">
              <div className="skeleton h-4 w-3/4 mb-4" />
              <div className="skeleton h-8 w-1/2" />
            </div>
          ))}
        </div>
        <div className="card-clay p-6">
          <div className="skeleton h-6 w-1/3 mb-4" />
          <div className="skeleton" style={{ height: '232px' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-danger-500" />
            {t('admin.atRiskEarlyWarning')}
          </h1>
          <p className="text-primary-500 dark:text-gray-400 mt-1">{t('admin.atRiskDesc')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={fetchStudents} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('admin.refresh')}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={actionLoading === 'export' || filteredStudents.length === 0}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="size-4" aria-hidden="true" />
            {actionLoading === 'export' ? t('common.loading') : t('common.exportCSV')}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center gap-2"
            aria-expanded={showFilters}
            aria-controls="at-risk-filters"
          >
            <Filter className="size-4" aria-hidden="true" />
            {t('admin.filters')} {hasActiveFilters && (
              <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs px-2 py-0.5 rounded-full">
                {Object.values(filters).filter(v => v).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Threshold Controls */}
      <button
        type="button"
        onClick={() => setShowThresholds(!showThresholds)}
        className="btn-secondary flex items-center gap-2"
        aria-expanded={showThresholds}
        aria-controls="risk-threshold-controls"
      >
        <Settings className="size-4" aria-hidden="true" />
        {t('admin.riskThresholds')}
        {showThresholds ? (
          <ChevronUp className="size-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4" aria-hidden="true" />
        )}
      </button>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-clay p-4 border-l-4 border-l-danger-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-danger-700 dark:text-danger-300">{t('admin.highRisk')}</p>
              <p className="text-3xl font-bold text-danger-600 dark:text-danger-400">{riskCounts.high}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-danger-400" />
          </div>
          <p className="text-xs text-danger-500 dark:text-danger-400 mt-1">{t('admin.immediateIntervention')}</p>
        </div>
        <div className="card-clay p-4 border-l-4 border-l-warning-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('admin.mediumRisk')}</p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{riskCounts.medium}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
          <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">{t('admin.monitorClosely')}</p>
        </div>
        <div className="card-clay p-4 border-l-4 border-l-success-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-success-700 dark:text-success-300">{t('admin.lowRisk')}</p>
              <p className="text-3xl font-bold text-success-600 dark:text-success-400">{riskCounts.low}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-success-400" />
          </div>
          <p className="text-xs text-success-500 dark:text-success-400 mt-1">{t('admin.onTrack')}</p>
        </div>
      </div>

      {/* Filter Sidebar */}
      {showFilters && (
        <div id="at-risk-filters" className="card-clay animate-slide-down p-4">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-ink-muted">{t('common.search')}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t('common.searchPlaceholder')}
                className="min-h-11 w-full rounded-xl border border-divider bg-surface px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </label>
            <SelectFilter
              label={t('common.grade')}
              value={filters.grade}
              options={GRADE_OPTIONS}
              onChange={(value) => handleFilterChange('grade', value)}
              placeholder={t('common.allGrades')}
            />
            <SelectFilter
              label={t('admin.riskLevel')}
              value={filters.risk_level}
              options={RISK_LEVELS.map((value) => ({
                value,
                label: t(`admin.${value}Risk`),
              }))}
              onChange={(value) => handleFilterChange('risk_level', value)}
              placeholder={t('common.all')}
            />
          </div>
          {(hasActiveFilters || search) && (
            <button
              type="button"
              onClick={() => {
                clearFilters();
                setSearch('');
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X className="size-4" aria-hidden="true" />
              {t('admin.clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* Threshold Controls Sidebar */}
      {showThresholds && (
        <div id="risk-threshold-controls" className="card-clay animate-slide-down p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">{t('admin.riskThresholds')}</h3>
            <button
              type="button"
              onClick={clearThresholds}
              className="min-h-11 rounded-lg px-2 text-xs font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {t('admin.resetDefaults')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="attendance-threshold" className="text-xs font-medium text-primary-600 dark:text-gray-400">
                {t('admin.attendance')} &lt; {thresholds.attendance}%
              </label>
              <input
                id="attendance-threshold"
                type="range"
                min="50"
                max="95"
                step="5"
                value={thresholds.attendance}
                onChange={(e) => handleThresholdChange('attendance', parseInt(e.target.value, 10))}
                className="w-full accent-primary-600"
              />
              <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600">
                <span>50%</span><span>75%</span><span>95%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="study-hours-threshold" className="text-xs font-medium text-primary-600 dark:text-gray-400">
                {t('admin.studyHours')} &lt; {thresholds.study_hours}h/day
              </label>
              <input
                id="study-hours-threshold"
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={thresholds.study_hours}
                onChange={(e) => handleThresholdChange('study_hours', parseFloat(e.target.value))}
                className="w-full accent-primary-600"
              />
              <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600">
                <span>0h</span><span>2h</span><span>5h</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="gpa-threshold" className="text-xs font-medium text-primary-600 dark:text-gray-400">
                {t('admin.gpa')} &lt; {thresholds.gpa.toFixed(1)}
              </label>
              <input
                id="gpa-threshold"
                type="range"
                min="1.0"
                max="3.5"
                step="0.1"
                value={thresholds.gpa}
                onChange={(e) => handleThresholdChange('gpa', parseFloat(e.target.value))}
                className="w-full accent-primary-600"
              />
              <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600">
                <span>1.0</span><span>2.0</span><span>3.5</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-ink-muted">
            {t('admin.riskThresholdsHelp')}
          </p>
        </div>
      )}

      {/* At-Risk Students Table */}
      <div className="card-clay overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">{t('admin.atRiskStudents')}</caption>
            <thead className="bg-primary-50 dark:bg-gray-900/50 border-b border-primary-100 dark:border-gray-800">
              <tr>
                {tableColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted"
                    aria-sort={sort === col.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg text-left transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      aria-label={t('table.sortBy', { column: col.label })}
                    >
                      {col.label}
                      {sort === col.key && (
                        dir === 'asc'
                          ? <ChevronUp className="size-4" aria-hidden="true" />
                          : <ChevronDown className="size-4" aria-hidden="true" />
                      )}
                    </button>
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
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-ink-muted">
                      {rawStudents.length === 0 ? (
                        <CheckCircle className="size-12 text-success-500" aria-hidden="true" />
                      ) : (
                        <Filter className="size-12 text-action" aria-hidden="true" />
                      )}
                      <p className="font-medium text-ink">
                        {rawStudents.length === 0
                          ? t('admin.noAtRiskFound')
                          : t('admin.noStudentsFound')}
                      </p>
                      <p className="text-sm">
                        {rawStudents.length === 0
                          ? t('admin.allOnTrack')
                          : t('table.emptyDescription')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-primary-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{student.student_id || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-primary-950 dark:text-gray-100">{student.name || '—'}</div>
                      <div className="text-xs text-ink-muted">
                        {student.gender || '—'} · {t('common.age')} {formatAdminMetric(student.age, 0)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        student.grade === 'A' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
                        student.grade === 'B' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' :
                        student.grade === 'C' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                        student.grade === 'D' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                        student.grade === 'F' ? 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300' :
                        'bg-surface-muted text-ink-muted'
                      }`}>
                        {GRADE_OPTIONS.includes(student.grade) ? student.grade : t('admin.unknown')}
                      </span>
                    </td>
                    <td className="px-4 py-3"><RiskBadge riskLevel={student.risk_level} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(student.risk_factors || []).map(factor => (
                          <RiskFactorTag key={factor} factor={factor} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-ink">
                      {formatAdminMetric(student.attendance_percent, 1, '%')}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-ink">
                      {formatAdminMetric(student.sleep_hours, 1)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-ink">
                      {formatAdminMetric(student.previous_gpa, 2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-ink">
                      {formatAdminMetric(student.study_hours_per_day, 1)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        student.part_time_job === 'Yes'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}>
                        {student.part_time_job || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleGenerateIntervention(student)}
                        disabled={generatingStudentId !== null}
                        className="btn-primary inline-flex min-h-11 items-center gap-1.5 text-xs"
                      >
                        <Brain className="size-4" aria-hidden="true" />
                        {generatingStudentId === student.id
                          ? t('common.loading')
                          : t('admin.aiIntervention')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <nav
            className="flex flex-col gap-3 border-t border-divider px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            aria-label={t('table.pagination')}
          >
            <p className="text-sm text-ink-muted">
              {t('common.showing', {
                start: pagination.start,
                end: pagination.end,
                total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={pagination.page <= 1}
                aria-label={t('table.previousPage')}
              >
                {t('common.previous')}
              </Button>
              <span className="min-w-24 text-center text-sm text-ink-muted" aria-live="polite">
                {t('table.pageOf', {
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                disabled={pagination.page >= pagination.totalPages}
                aria-label={t('table.nextPage')}
              >
                {t('common.next')}
              </Button>
            </div>
          </nav>
        )}
      </div>

      <Modal
        isOpen={showInterventionModal && Boolean(selectedStudent)}
        onClose={closeInterventionModal}
        title={t('admin.aiIntervention')}
        description={t('admin.interventionSaved')}
        size="lg"
        footer={
          <Button type="button" variant="primary" onClick={closeInterventionModal}>
            {t('common.close')}
          </Button>
        }
      >
        {selectedStudent && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-muted p-3">
              <p className="text-sm font-medium text-ink">
                {t('admin.student')}: {selectedStudent.name || '—'} ({selectedStudent.student_id || '—'})
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span>{t('admin.riskLevel')}:</span>
                <RiskBadge riskLevel={selectedStudent.risk_level} />
              </div>
            </div>
            <section aria-labelledby="intervention-note-heading">
              <h3 id="intervention-note-heading" className="text-sm font-medium text-ink">
                {t('admin.interventionNote')}
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-divider bg-surface p-4 font-mono text-sm leading-6 text-ink">
                {interventionNote}
              </p>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}