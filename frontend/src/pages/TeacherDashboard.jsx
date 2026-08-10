import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { api } from '../api';
import { renderIcon } from '../components/IconMap';

export default function TeacherDashboard() {
  const { user, homeForRole } = useAuth();
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [students, setStudents] = useState([]);
  const [atRiskStudents, setAtRiskStudents] = useState([]);
  const [activeTab, setActiveTab] = useState('analytics');
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, size: 20 });
  const [filters, setFilters] = useState({
    q: '',
    grade: 'all',
    gender: 'all',
    part_time_job: 'all',
    parental_education: 'all',
    at_risk: 'all',
  });
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showCounselModal, setShowCounselModal] = useState(false);
  const [counselPrompt, setCounselPrompt] = useState('');

  const [counselLoading, setCounselLoading] = useState(false);

  useEffect(() => {
    fetchAnalytics();
    fetchStudents();
    fetchAtRiskStudents();
  }, [activeTab, filters, pagination.page]);

  const fetchAnalytics = async () => {
    try {
      const res = await api.get('/teacher/analytics');
      setAnalytics(res);
      setFilterOptions(res.filterOptions || {});
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      addFlash(t('teacher.analyticsLoadFailed'), 'error');
      if (err.status === 403) navigate(homeForRole(user?.role));
    }
  };

  const fetchStudents = async () => {
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        size: pagination.size,
        ...filters,
      });
      const res = await api.get(`/teacher/students?${params}`);
      setStudents(res.rows);
      setPagination(prev => ({ ...prev, total: res.total, totalPages: res.totalPages, page: res.page }));
    } catch (err) {
      console.error('Failed to fetch students:', err);
      addFlash(t('teacher.studentsLoadFailed'), 'error');
    }
  };

  const fetchAtRiskStudents = async () => {
    try {
      const res = await api.get('/teacher/at-risk');
      setAtRiskStudents(res.students || []);
    } catch (err) {
      console.error('Failed to fetch at-risk students:', err);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, page }));
  };

  const handleCounsel = async (studentId) => {
    setSelectedStudent(students.find(s => s.id === studentId));
    setShowCounselModal(true);
    setCounselPrompt('');
  };

  const handleGenerateCounsel = async () => {
    if (!selectedStudent) return;
    setCounselLoading(true);
    try {
      await api.post('/teacher/ai-counsel', {
        studentId: selectedStudent.id,
        customPrompt: counselPrompt,
      });
      addFlash(t('teacher.counselGenerated'), 'success');
      setShowCounselModal(false);
      fetchStudents();
    } catch (err) {
      console.error('Failed to generate counsel:', err);
      addFlash(t('teacher.counselFailed'), 'error');
    } finally {
      setCounselLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const riskLevelColors = {
    high: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
    medium: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    low: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
  };

  const gradeColor = (grade) => {
    const colors = {
      A: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
      B: 'bg-info-100 text-info-700 dark:bg-info-900/30 dark:text-info-400',
      C: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
      D: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
      F: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
    };
    return colors[grade] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  };

  // Helper components
  const Card = ({ children, className = '', ...props }) => (
    <div className={`card ${className}`} {...props}>{children}</div>
  );

  const Badge = ({ children, className = '', variant = 'default', size = 'default', ...props }) => {
    const variants = {
      default: 'badge',
      outline: 'badge border',
      success: 'badge-success',
      warning: 'badge-warning',
      danger: 'badge-danger',
      primary: 'badge-primary',
    };
    const sizes = {
      default: 'px-2.5 py-0.5 text-xs',
      sm: 'px-2 py-0.5 text-[10px]',
      lg: 'px-3 py-1 text-sm',
    };
    return (
      <span className={`inline-flex items-center ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
        {children}
      </span>
    );
  };

  const Button = ({ children, className = '', variant = 'primary', size = 'default', loading = false, onClick, disabled, ...props }) => {
    const variants = {
      primary: 'btn btn-primary',
      success: 'btn btn-success',
      danger: 'btn btn-danger',
      secondary: 'btn btn-secondary',
      outline: 'btn border border-primary-300 text-primary-700 hover:bg-primary-50 dark:border-gray-600 dark:text-primary-400 dark:hover:bg-gray-800',
      ghost: 'btn btn-ghost',
    };
    const sizes = {
      default: 'px-4 py-2.5 text-sm',
      sm: 'px-3 py-1.5 text-xs',
      lg: 'px-6 py-3 text-lg',
    };
    return (
      <button
        className={`inline-flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className}`}
        onClick={onClick}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
        {children}
      </button>
    );
  };

  const Modal = ({ isOpen, onClose, title, size = 'default', children }) => {
    if (!isOpen) return null;
    const sizes = {
      default: 'max-w-md',
      sm: 'max-w-sm',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
    };
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} aria-hidden="true" />
          <div className={`relative w-full ${sizes[size]} transform overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-xl transition-all`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200 dark:border-gray-700">
              <h2 id="modal-title" className="text-lg font-semibold text-primary-950 dark:text-gray-100">{title}</h2>
              <button onClick={onClose} className="text-primary-400 hover:text-primary-600 dark:text-gray-500 dark:hover:text-gray-300" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">{children}</div>
          </div>
        </div>
      </div>
    );
  };

  const Table = ({ children, className = '', ...props }) => (
    <div className={`overflow-x-auto ${className}`} {...props}>
      <table className="w-full">{children}</table>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
            {t('teacher.dashboardTitle')}
          </h1>
          <p className="text-primary-500 dark:text-gray-400">
            {t('teacher.dashboardSubtitle', { name: user?.name })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-primary-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto" role="tablist">
          {[
            { id: 'analytics', label: t('teacher.tabAnalytics'), icon: renderIcon('LayoutDashboard', { className: "w-5 h-5" }) },
            { id: 'students', label: t('teacher.tabStudents'), icon: renderIcon('Users', { className: "w-5 h-5" }) },
            { id: 'at-risk', label: t('teacher.tabAtRisk'), icon: renderIcon('AlertTriangle', { className: "w-5 h-5" }) },
          ].map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-t-xl text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                  : 'text-primary-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400'
              }`}
            >
              <span className="flex items-center">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-6">
              <p className="text-sm text-primary-500 dark:text-gray-400">{t('teacher.totalStudents')}</p>
              <p className="text-3xl font-bold font-mono text-primary-950 dark:text-gray-100 mt-1">{analytics.kpis.totalStudents}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-primary-500 dark:text-gray-400">{t('teacher.avgGPA')}</p>
              <p className="text-3xl font-bold font-mono text-primary-950 dark:text-gray-100 mt-1">{analytics.kpis.avgGpa?.toFixed(2)}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-primary-500 dark:text-gray-400">{t('teacher.passRate')}</p>
              <p className="text-3xl font-bold font-mono text-success-600 dark:text-success-400 mt-1">{analytics.kpis.passRate?.toFixed(1)}%</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-primary-500 dark:text-gray-400">{t('teacher.atRiskCount')}</p>
              <p className="text-3xl font-bold font-mono text-danger-600 dark:text-danger-400 mt-1">{analytics.kpis.atRiskCount}</p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Grade Distribution */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">
                {t('teacher.gradeDistribution')}
              </h3>
              <div className="h-64 flex items-end justify-around gap-2">
                {analytics.charts.gradeDistribution?.map((g, idx) => (
                  <div key={idx} className="flex flex-col items-center flex-1">
                    <div
                      className="w-full transition-all duration-500 rounded-t"
                      style={{
                        height: `${(g.count / Math.max(...analytics.charts.gradeDistribution.map(x => x.count), 1)) * 100}%`,
                        backgroundColor: gradeColor(g.grade).split(' ')[0].replace('bg-', ''),
                      }}
                    />
                    <span className="text-sm font-medium mt-2 text-primary-950 dark:text-gray-100">{g.grade}</span>
                    <span className="text-xs text-primary-400 dark:text-gray-500">{g.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Attendance vs Score */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">
                {t('teacher.attendanceVsScore')}
              </h3>
              <div className="h-64 relative">
                <svg viewBox="0 0 400 300" className="w-full h-full">
                  {analytics.charts.attendanceVsScore?.map((point, idx) => (
                    <circle
                      key={idx}
                      cx={40 + (point.x / 100) * 320}
                      cy={260 - (point.y / 100) * 220}
                      r="4"
                      fill="url(#primaryGradient)"
                    />
                  ))}
                  <defs>
                    <linearGradient id="primaryGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </Card>

            {/* Sleep Impact */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">
                {t('teacher.sleepImpact')}
              </h3>
              <div className="space-y-3">
                {analytics.charts.sleepImpact?.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium text-primary-600 dark:text-gray-400">{s.sleepBucket}</span>
                    <div className="flex-1 h-8 bg-primary-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-500 transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.min(s.avgScore / 100, 1) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">{s.avgScore?.toFixed(1)}</span>
                      </div>
                    </div>
                    <span className="w-12 text-sm text-primary-500 dark:text-gray-400 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Part-Time Job Impact */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">
                {t('teacher.partTimeJobImpact')}
              </h3>
              <div className="space-y-3">
                {analytics.charts.partTimeJobImpact?.map((j, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-primary-600 dark:text-gray-400">{j.category}</span>
                    <div className="flex-1 h-8 bg-primary-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-warning-500 transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.min(j.avgScore / 100, 1) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">{j.avgScore?.toFixed(1)}</span>
                      </div>
                    </div>
                    <span className="w-12 text-sm text-primary-500 dark:text-gray-400 text-right">{j.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Students Tab */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          {/* Filters */}
          <Card className="p-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <div className="md:col-span-2">
                <label className="label">{t('common.search')}</label>
                <input
                  type="text"
                  placeholder={t('common.searchPlaceholder')}
                  value={filters.q}
                  onChange={(e) => handleFilterChange('q', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">{t('common.grade')}</label>
                <select value={filters.grade} onChange={(e) => handleFilterChange('grade', e.target.value)} className="input">
                  <option value="all">{t('common.allGrades')}</option>
                  {filterOptions.grades?.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('common.gender')}</label>
                <select value={filters.gender} onChange={(e) => handleFilterChange('gender', e.target.value)} className="input">
                  <option value="all">{t('common.allGenders')}</option>
                  {filterOptions.genders?.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('common.partTimeJob')}</label>
                <select value={filters.part_time_job} onChange={(e) => handleFilterChange('part_time_job', e.target.value)} className="input">
                  <option value="all">{t('common.all')}</option>
                  {filterOptions.partTimeJobs?.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('common.parentalEducation')}</label>
                <select value={filters.parental_education} onChange={(e) => handleFilterChange('parental_education', e.target.value)} className="input">
                  <option value="all">{t('common.all')}</option>
                  {filterOptions.parentalEducations?.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Students Table */}
          <Card className="p-0 overflow-hidden">
            <Table>
              <thead>
                <tr className="bg-primary-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.studentId')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.name')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.grade')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.finalScore')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.attendance')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.studyHours')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.sleepHours')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.gpa')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.riskLevel')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, idx) => (
                  <tr key={student.id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-primary-50/30 dark:bg-gray-800/30'}>
                    <td className="px-4 py-3 text-sm text-primary-950 dark:text-gray-100">{student.student_id}</td>
                    <td className="px-4 py-3 text-sm font-medium text-primary-950 dark:text-gray-100">{student.name || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <Badge className={gradeColor(student.grade)}>{student.grade}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.final_score}</td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.attendance_percent}%</td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.study_hours_per_day}h</td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.sleep_hours}h</td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.previous_gpa}</td>
                    <td className="px-4 py-3 text-sm">
                      {atRiskStudents.find(s => s.id === student.id) && (
                        <Badge className={riskLevelColors[atRiskStudents.find(s => s.id === student.id)?.risk_level]}>
                          {t(`common.risk${atRiskStudents.find(s => s.id === student.id)?.risk_level}`)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleCounsel(student.id)}>
                          {renderIcon('MessageSquare', { className: "w-4 h-4" })}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-primary-400 dark:text-gray-500">
                      {t('common.noStudents')}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-primary-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-sm text-primary-500 dark:text-gray-400">
                  {t('common.showing', { start: (pagination.page - 1) * pagination.size + 1, end: Math.min(pagination.page * pagination.size, pagination.total), total: pagination.total })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1}>
                    {t('common.prev')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}>
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* At-Risk Tab */}
      {activeTab === 'at-risk' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-primary-950 dark:text-gray-100">
              {t('teacher.atRiskStudents', { count: atRiskStudents.length })}
            </h2>
          </div>

          {atRiskStudents.length > 0 ? (
            <Card className="p-0 overflow-hidden">
              <Table>
                <thead>
                  <tr className="bg-primary-50 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.studentId')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.name')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.riskLevel')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.riskScore')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.riskFactors')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.grade')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.finalScore')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.attendance')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.studyHours')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.gpa')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.sleep')}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-primary-500 dark:text-gray-400">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskStudents.map((student, idx) => (
                    <tr key={student.id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-primary-50/30 dark:bg-gray-800/30'}>
                      <td className="px-4 py-3 text-sm text-primary-950 dark:text-gray-100">{student.student_id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-primary-950 dark:text-gray-100">{student.name || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <Badge className={riskLevelColors[student.risk_level]}>
                          {t(`common.risk${student.risk_level}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold font-mono text-primary-950 dark:text-gray-100">{student.risk_score}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {student.risk_factors?.map((factor, fi) => {
                              const labelKey = `common.riskFactor.${factor.field}`;
                              return (
                                <Badge key={fi} variant="outline" size="sm" className={
                                  factor.field === 'attendance' ? 'border-danger-500 text-danger-600' :
                                  factor.field === 'study_hours' ? 'border-warning-500 text-warning-600' :
                                  factor.field === 'gpa' ? 'border-danger-500 text-danger-600' :
                                  'border-info-500 text-info-600'
                                }>
                                  {`${t(labelKey)}: ${factor.value} < ${factor.threshold}`}
                                </Badge>
                              );
                            })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge className={gradeColor(student.grade)}>{student.grade}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.final_score}</td>
                      <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.attendance_percent}%</td>
                      <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.study_hours_per_day}h</td>
                      <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.previous_gpa}</td>
                      <td className="px-4 py-3 text-sm font-mono text-primary-950 dark:text-gray-100">{student.sleep_hours}h</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleCounsel(student.id)}>
                          {renderIcon('MessageSquare', { className: "w-4 h-4" })}
                          <span className="hidden sm:inline ml-1">{t('teacher.aiCounsel')}</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              {renderIcon('CheckCircle', { className: "w-16 h-16 text-success-500 mx-auto mb-4" })}
              <h3 className="text-lg font-medium text-primary-950 dark:text-gray-100 mb-2">
                {t('teacher.noAtRiskStudents')}
              </h3>
              <p className="text-primary-500 dark:text-gray-400">
                {t('teacher.noAtRiskStudentsDesc')}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* AI Counsel Modal */}
      {showCounselModal && selectedStudent && (
        <Modal
          isOpen={showCounselModal}
          onClose={() => setShowCounselModal(false)}
          title={t('teacher.aiCounselModalTitle', { name: selectedStudent.name })}
          size="lg"
        >
          <div className="space-y-4">
            <p className="text-primary-500 dark:text-gray-400">
              {t('teacher.aiCounselModalDesc')}
            </p>
            <textarea
              value={counselPrompt}
              onChange={(e) => setCounselPrompt(e.target.value)}
              placeholder={t('teacher.customPromptPlaceholder')}
              rows={4}
              className="input"
            />
            <div className="flex justify-end gap-3 pt-4 border-t border-primary-200 dark:border-gray-700">
              <Button variant="outline" onClick={() => setShowCounselModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleGenerateCounsel} loading={counselLoading}>
                {t('teacher.generateCounsel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}