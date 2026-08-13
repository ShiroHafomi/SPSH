import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import {
  AlertTriangle,
  Brain,
  Eye,
  Download,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatLabel } from '../utils/formatLabel';

const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'];
const RISK_LEVELS = ['High', 'Medium', 'Low'];

function RiskBadge({ riskLevel }) {
  const { t } = useLanguage();
  const styles = {
    high: 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300 border-danger-200 dark:border-danger-800',
    medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    low: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800',
  };
  const icons = {
    high: <AlertCircle className="w-3 h-3" />,
    medium: <AlertTriangle className="w-3 h-3" />,
    low: <CheckCircle className="w-3 h-3" />,
  };
  const riskLabels = {
    high: t('admin.highRisk'),
    medium: t('admin.mediumRisk'),
    low: t('admin.lowRisk'),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${styles[riskLevel] || styles.low}`}>
      {icons[riskLevel] || icons.low}
      {riskLabels[riskLevel] || formatLabel(riskLevel) || 'Unknown'}
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
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${factorStyles[factor] || factorStyles.attendance}`}>
      {formatLabel(factor)}
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

export default function AdminAtRisk() {
  const { flash, addFlash } = useFlash();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
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
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showInterventionModal, setShowInterventionModal] = useState(false);
  const [interventionNote, setInterventionNote] = useState('');
  const [generatingIntervention, setGeneratingIntervention] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
        sort,
        dir,
        attendance: thresholds.attendance.toString(),
        study_hours: thresholds.study_hours.toString(),
        gpa: thresholds.gpa.toString(),
      });
      if (search) params.append('q', search);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const data = await api.get(`/admin/at-risk?${params.toString()}`);
      setStudents(data.students || []);
      setTotal(data.total || 0);
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: 'Failed to load at-risk students' });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, dir, search, filters, thresholds, addFlash]);

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

  const handleGenerateIntervention = async (student) => {
    setSelectedStudent(student);
    setGeneratingIntervention(true);
    try {
      const data = await api.post(`/admin/students/${student.id}/intervention`);
      setInterventionNote(data.intervention_note || t('admin.interventionGenerated'));
      setShowInterventionModal(true);
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.interventionFailed') });
      }
    } finally {
      setGeneratingIntervention(false);
    }
  };

  const handleSaveIntervention = async () => {
    if (!selectedStudent) return;
    try {
      addFlash({ type: 'success', message: t('admin.interventionSaved') });
      setShowInterventionModal(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (err) {
      addFlash({ type: 'error', message: 'Failed to save intervention' });
    }
  };

  const handleExport = async () => {
    try {
      setActionLoading('export');
      const response = await fetch('/api/admin/students/bulk-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: students.map(s => s.id), filters: { ...filters, at_risk: 'true' } }),
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
    high: students.filter(s => s.risk_level === 'high').length,
    medium: students.filter(s => s.risk_level === 'medium').length,
    low: students.filter(s => s.risk_level === 'low').length,
  };

  const tableColumns = [
    { key: 'student_id', label: t('admin.studentID') },
    { key: 'name', label: t('admin.name') },
    { key: 'grade', label: 'Grade' },
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
      <div className="space-y-6">
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
          <button onClick={fetchStudents} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('admin.refresh')}
          </button>
          <button onClick={handleExport} disabled={actionLoading === 'export'} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {t('common.exportCSV')}
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className="btn-secondary flex items-center gap-2">
            <Filter className="w-4 h-4" />
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
        onClick={() => setShowThresholds(!showThresholds)}
        className="btn-secondary flex items-center gap-2"
      >
        <Settings className="w-4 h-4" />
        Risk Thresholds

        {showThresholds && <ChevronUp className="w-4 h-4" />}
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
        <div className="card-clay p-4 animate-slide-down">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <SelectFilter label="Grade" value={filters.grade} options={GRADE_OPTIONS} onChange={(v) => handleFilterChange('grade', v)} />
            <SelectFilter label={t('admin.riskLevel')} value={filters.risk_level} options={RISK_LEVELS} onChange={(v) => handleFilterChange('risk_level', v)} />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" />
              {t('admin.clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* Threshold Controls Sidebar */}
      {showThresholds && (
        <div className="card-clay p-4 animate-slide-down">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-primary-950 dark:text-gray-100">Risk Thresholds</h3>
            <button onClick={clearThresholds} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
              Reset to defaults
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-600 dark:text-gray-400">
                {t('admin.attendance')} &lt; {thresholds.attendance}%
              </label>
              <input
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
              <label className="text-xs font-medium text-primary-600 dark:text-gray-400">
                {t('admin.studyHours')} &lt; {thresholds.study_hours}h/day
              </label>
              <input
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
              <label className="text-xs font-medium text-primary-600 dark:text-gray-400">
                {t('admin.gpa')} &lt; {thresholds.gpa.toFixed(1)}
              </label>
              <input
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
          <p className="text-xs text-primary-400 dark:text-gray-500 mt-3 text-center">
            Students falling below any threshold are flagged as at-risk. Adjust sliders to update.
          </p>
        </div>
      )}

      {/* At-Risk Students Table */}
      <div className="card-clay overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-primary-50 dark:bg-gray-900/50 border-b border-primary-100 dark:border-gray-800">
              <tr>
                {tableColumns.map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider cursor-pointer hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {sort === col.key && (dir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
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
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-primary-500 dark:text-gray-400">
                      <CheckCircle className="w-12 h-12 text-success-500" />
                      <p className="font-medium">{t('admin.noAtRiskFound')}</p>
                      <p className="text-sm">{t('admin.allOnTrack')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-primary-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">{student.student_id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-primary-950 dark:text-gray-100">{student.name || '—'}</div>
                      <div className="text-xs text-primary-500 dark:text-gray-400">
                        {student.gender}, Age {student.age}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        student.grade === 'A' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
                        student.grade === 'B' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' :
                        student.grade === 'C' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                        student.grade === 'D' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                        'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300'
                      }`}>
                        {student.grade}
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
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">
                      {student.attendance_percent?.toFixed(1) || '—'}%
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">
                      {student.sleep_hours?.toFixed(1) || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">
                      {student.previous_gpa?.toFixed(2) || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-950 dark:text-gray-100">
                      {student.study_hours_per_day?.toFixed(1) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        student.part_time_job === 'Yes'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}>
                        {student.part_time_job}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => window.open(`/students/${student.id}`, '_blank')}
                          className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-xl transition-colors"
                          title={t('admin.viewDetails')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleGenerateIntervention(student)}
                          disabled={actionLoading === `intervention-${student.id}`}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          <Brain className="w-3.5 h-3.5" />
                          {t('admin.aiIntervention')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intervention Modal */}
      {showInterventionModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-primary-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-primary-950 dark:text-gray-100">{t('admin.aiIntervention')}</h2>
              <button onClick={() => { setShowInterventionModal(false); setSelectedStudent(null); }} className="p-2 text-primary-500 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                <p className="text-sm font-medium text-primary-950 dark:text-gray-100">{t('admin.student')}: {selectedStudent.name} ({selectedStudent.student_id})</p>
                <p className="text-sm text-primary-600 dark:text-primary-400 mt-1">{t('admin.riskLevel')}: <RiskBadge riskLevel={selectedStudent.risk_level} /></p>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-primary-700 dark:text-gray-300">{t('admin.interventionNote')}</label>
                <textarea
                  value={interventionNote}
                  onChange={(e) => setInterventionNote(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-y font-mono"
                  placeholder={t('admin.aiGeneratedPlaceholder')}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-primary-100 dark:border-gray-800">
              <button onClick={() => { setShowInterventionModal(false); setSelectedStudent(null); }} className="btn-secondary">
                {t('common.close')}
              </button>
              <button onClick={handleSaveIntervention} disabled={generatingIntervention} className="btn-primary flex items-center gap-2">
                {generatingIntervention && <RefreshCw className="w-4 h-4 animate-spin" />}
                {t('admin.saveToStudent')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          {...confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}