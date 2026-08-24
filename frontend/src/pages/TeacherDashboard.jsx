import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { api } from '../api';
import { renderIcon } from '../components/IconMap';
import { MessageSquare, AlertTriangle, Users, CheckCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { MULTI_SERIES_COLORS, GRADE_COLORS, getChartOptions, getScatterOptions, getHorizontalBarOptions } from '../utils/chartTheme';
import { formatLabel } from '../utils/formatLabel';
import { useTheme } from '../hooks/useTheme';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import { Card, Badge, Button, Modal, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

// Grade color utility
const gradeColors = {
  A: { bg: 'bg-success-100 dark:bg-success-950/40', text: 'text-success-700 dark:text-success-300', border: 'border-success-500' },
  B: { bg: 'bg-sky-100 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-500' },
  C: { bg: 'bg-warning-100 dark:bg-warning-950/40', text: 'text-warning-700 dark:text-warning-300', border: 'border-warning-500' },
  D: { bg: 'bg-danger-100 dark:bg-danger-950/40', text: 'text-danger-700 dark:text-danger-300', border: 'border-danger-500' },
  F: { bg: 'bg-danger-100 dark:bg-danger-950/40', text: 'text-danger-700 dark:text-danger-300', border: 'border-danger-500' },
};

// Risk level colors
const riskLevelColors = {
  high: { bg: 'bg-danger-100 dark:bg-danger-950/40', text: 'text-danger-700 dark:text-danger-300' },
  medium: { bg: 'bg-warning-100 dark:bg-warning-950/40', text: 'text-warning-700 dark:text-warning-300' },
  low: { bg: 'bg-success-100 dark:bg-success-950/40', text: 'text-success-700 dark:text-success-300' },
};

const getGradeBadge = (grade) => {
  const colors = gradeColors[grade] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' };
  return colors;
};

const getRiskBadge = (level) => {
  return riskLevelColors[level] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' };
};

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
  const [filters, setFilters] = useState({ q: '', grade: 'all', gender: 'all', part_time_job: 'all', parental_education: 'all', at_risk: 'all' });
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showCounselModal, setShowCounselModal] = useState(false);
  const [counselPrompt, setCounselPrompt] = useState('');
  const [counselLoading, setCounselLoading] = useState(false);
  const [whatIfStudent, setWhatIfStudent] = useState(null);
  const [whatIfBaseline, setWhatIfBaseline] = useState(null);
  const [whatIfSimulated, setWhatIfSimulated] = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [modalWhatIfFeature, setModalWhatIfFeature] = useState('study_hours_per_day');
  const [modalWhatIfValue, setModalWhatIfValue] = useState(4);
  const { isDark } = useTheme();

  // ─── Data fetching ────────────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await api.get('/teacher/analytics');
      setAnalytics(res);
      setFilterOptions(res.filterOptions || {});
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      addFlash(t('teacher.analyticsLoadFailed'), 'error');
      if (err.status === 403) navigate(homeForRole(user?.role));
    } finally {
      setLoading(false);
    }
  }, [addFlash, navigate, t, user?.role, homeForRole]);

  const fetchStudents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: pagination.page, size: pagination.size, ...filters });
      const res = await api.get(`/teacher/students?${params}`);
      setStudents(res.rows);
      setPagination(prev => ({ ...prev, total: res.total, totalPages: res.totalPages, page: res.page }));
    } catch (err) {
      console.error('Failed to fetch students:', err);
      addFlash(t('teacher.studentsLoadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addFlash, pagination.page, pagination.size, filters, t]);

  const fetchAtRiskStudents = useCallback(async () => {
    try {
      const res = await api.get('/teacher/at-risk');
      setAtRiskStudents(res.students || []);
    } catch (err) {
      console.error('Failed to fetch at-risk students:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    fetchAtRiskStudents();
  }, [fetchAtRiskStudents]);

  // ─── Charts memo ──────────────────────────────────────────────────────────────
  const charts = useMemo(() => {
    if (!analytics?.charts) return [];
    return [
      analytics.charts.gradeDistribution && {
        chartType: 'bar',
        key: 'gradeDistribution',
        data: {
          labels: analytics.charts.gradeDistribution.map(g => `Grade ${g.grade}`),
          datasets: [{
            label: t('teacher.gradeDistribution'),
            data: analytics.charts.gradeDistribution.map(g => g.count),
            backgroundColor: analytics.charts.gradeDistribution.map(g => GRADE_COLORS[g.grade]?.bg || MULTI_SERIES_COLORS[0].bg),
            borderColor: analytics.charts.gradeDistribution.map(g => GRADE_COLORS[g.grade]?.border || MULTI_SERIES_COLORS[0].border),
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 52,
            hoverBackgroundColor: analytics.charts.gradeDistribution.map(g => GRADE_COLORS[g.grade]?.solid || MULTI_SERIES_COLORS[0].solid),
            hoverBorderColor: analytics.charts.gradeDistribution.map(g => GRADE_COLORS[g.grade]?.border || MULTI_SERIES_COLORS[0].border),
          }],
        },
        options: getChartOptions(isDark),
      },
      analytics.charts.attendanceVsScore && {
        chartType: 'scatter',
        key: 'attendanceVsScore',
        data: {
          datasets: [{
            label: `${t('common.attendance')} vs ${t('common.finalScore')}`,
            data: analytics.charts.attendanceVsScore.map(d => ({ x: d.x, y: d.y })),
            backgroundColor: MULTI_SERIES_COLORS[0].solid + 'B3',
            borderColor: MULTI_SERIES_COLORS[0].solid,
            borderWidth: 2,
            pointRadius: 7,
            pointHoverRadius: 9,
            pointBorderWidth: 2,
            pointBorderColor: isDark ? '#0f172a' : '#ffffff',
            pointStyle: 'circle',
          }],
        },
        options: getScatterOptions(isDark, t('common.attendance'), t('common.finalScore')),
      },
      analytics.charts.sleepImpact && {
        chartType: 'bar',
        key: 'sleepImpact',
        data: {
          labels: analytics.charts.sleepImpact.map(s => s.sleepBucket),
          datasets: [{
            label: t('teacher.sleepImpact'),
            data: analytics.charts.sleepImpact.map(s => s.avgScore),
            backgroundColor: MULTI_SERIES_COLORS[1].bg,
            borderColor: MULTI_SERIES_COLORS[1].border,
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 40,
            hoverBackgroundColor: MULTI_SERIES_COLORS[1].solid,
            hoverBorderColor: MULTI_SERIES_COLORS[1].border,
          }],
        },
        options: getHorizontalBarOptions(isDark),
      },
      analytics.charts.partTimeJobImpact && {
        chartType: 'bar',
        key: 'partTimeJobImpact',
        data: {
          labels: analytics.charts.partTimeJobImpact.map(j => j.category),
          datasets: [{
            label: t('teacher.partTimeJobImpact'),
            data: analytics.charts.partTimeJobImpact.map(j => j.avgScore),
            backgroundColor: MULTI_SERIES_COLORS[3].bg,
            borderColor: MULTI_SERIES_COLORS[3].border,
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 40,
            hoverBackgroundColor: MULTI_SERIES_COLORS[3].solid,
            hoverBorderColor: MULTI_SERIES_COLORS[3].border,
          }],
        },
        options: getHorizontalBarOptions(isDark),
      },
    ].filter(Boolean);
  }, [analytics, isDark, t]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const handleCounsel = useCallback((student) => {
    setSelectedStudent(student);
    setShowCounselModal(true);
    setCounselPrompt('');
  }, []);

  const handleGenerateCounsel = useCallback(async () => {
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
  }, [selectedStudent, counselPrompt, addFlash, fetchStudents, api]);

  const handleWhatIfForStudent = useCallback(async (student) => {
    setWhatIfStudent(student);
    setWhatIfLoading(true);
    try {
      // Get baseline prediction (current)
      const baselineRes = await api.post('/feedback', {
        gender: student.gender,
        age: student.age,
        study_hours_per_day: student.study_hours_per_day,
        attendance_percent: student.attendance_percent,
        sleep_hours: student.sleep_hours,
        previous_gpa: student.previous_gpa,
        parental_education: student.parental_education,
        internet_access: student.internet_access,
        extracurricular: student.extracurricular,
        part_time_job: student.part_time_job,
      });
      setWhatIfBaseline(baselineRes);
      // For simulation, we'll just show the baseline as the simulated for now? Actually we want to show what-if with a change.
      // But the requirement is to have a quick action button that opens a modal to run what-if.
      // We'll set the simulated to the baseline for now, and the modal will allow changing.
      setWhatIfSimulated(baselineRes);
    } catch (err) {
      console.error('Failed to run what-if simulation:', err);
      addFlash(err.message, 'error');
      setWhatIfBaseline(null);
      setWhatIfSimulated(null);
    } finally {
      setWhatIfLoading(false);
    }
  }, [addFlash, t]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6" role="status" aria-label="Loading dashboard">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-primary-200 dark:bg-gray-700 rounded-xl w-1/4" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="p-6">
                <div className="h-4 bg-primary-200 dark:bg-gray-700 rounded w-1/2" />
                <div className="h-10 bg-primary-200 dark:bg-gray-700 rounded w-1/4 mt-2" />
              </Card>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[1, 2].map(i => (
              <Card key={i} className="p-6">
                <div className="h-6 bg-primary-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
                <div className="h-80 bg-primary-200 dark:bg-gray-700 rounded-xl" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
            {t('teacher.dashboardTitle')}
          </h1>
          <p className="text-primary-600 dark:text-gray-400 mt-1">
            {t('teacher.dashboardSubtitle', { name: user?.name })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-primary-200 dark:border-gray-700" role="tablist" aria-label="Dashboard sections">
        <nav className="flex gap-1 overflow-x-auto scrollbar-thin" role="tablist">
          {[
            { id: 'analytics', label: t('teacher.tabAnalytics'), icon: 'LayoutDashboard' },
            { id: 'students', label: t('teacher.tabStudents'), icon: 'Users' },
            { id: 'at-risk', label: t('teacher.tabAtRisk'), icon: 'AlertTriangle' },
          ].map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-t-xl text-sm font-medium transition-colors whitespace-nowrap focus-ring ${
                activeTab === tab.id
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                  : 'text-primary-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400'
              }`}
            >
              <span className="flex items-center" aria-hidden="true">
                {renderIcon(tab.icon, { className: "w-5 h-5" })}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div id="panel-analytics" role="tabpanel" aria-labelledby="tab-analytics" className="space-y-6 animate-slide-up">
          {/* KPI Cards */}
          <section aria-label="Key Performance Indicators">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 bento-grid-4">
              <Card className="p-6 kpi-card">
                <div className="flex items-center gap-3">
                  <div className="kpi-icon-box bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                    {renderIcon(Users, { className: "w-5 h-5" })}
                  </div>
                  <div>
                    <p className="kpi-label">{t('teacher.totalStudents')}</p>
                    <p className="kpi-value tabular-nums">{analytics.kpis.totalStudents}</p>
                    <p className="text-xs text-primary-400 dark:text-gray-500">{t('teacher.kpiStudents')}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6 kpi-card">
                <div className="flex items-center gap-3">
                  <div className="kpi-icon-box bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <div>
                    <p className="kpi-label">{t('teacher.avgGPA')}</p>
                    <p className="kpi-value tabular-nums">{analytics.kpis.avgGpa?.toFixed(2)}</p>
                    <p className="text-xs text-primary-400 dark:text-gray-500">{t('teacher.kpiOutOfFour')}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6 kpi-card">
                <div className="flex items-center gap-3">
                  <div className="kpi-icon-box bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400">
                    {renderIcon(CheckCircle, { className: "w-5 h-5" })}
                  </div>
                  <div>
                    <p className="kpi-label">{t('teacher.passRate')}</p>
                    <p className="kpi-value tabular-nums text-success-600 dark:text-success-400">{analytics.kpis.passRate?.toFixed(1)}%</p>
                    <p className="text-xs text-primary-400 dark:text-gray-500">{t('teacher.kpiGradeABC')}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6 kpi-card">
                <div className="flex items-center gap-3">
                  <div className="kpi-icon-box bg-danger-100 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400">
                    {renderIcon(AlertTriangle, { className: "w-5 h-5" })}
                  </div>
                  <div>
                    <p className="kpi-label">{t('teacher.atRiskCount')}</p>
                    <p className="kpi-value tabular-nums text-danger-600 dark:text-danger-400">{analytics.kpis.atRiskCount}</p>
                    <p className="text-xs text-primary-400 dark:text-gray-500">{t('teacher.kpiNeedsAttention')}</p>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* Charts */}
          <section aria-label="Analytics Charts">
            <div className="grid gap-6 lg:grid-cols-2">
              {charts.map((chart) => (
                <Card key={chart.key} className="p-6">
                  <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100">
                      {formatLabel(chart.key === 'gradeDistribution' ? 'Grade Distribution' :
                        chart.key === 'attendanceVsScore' ? 'Attendance vs Final Score' :
                        chart.key === 'sleepImpact' ? 'Sleep Impact' :
                        'Part-Time Job Impact')}
                    </h3>
                    {chart.chartType === 'scatter' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                        <span className="truncate max-w-[100px]">{t('common.attendance')}</span>
                        <svg className="w-3 h-3 flex-shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        <span className="truncate max-w-[100px]">{t('common.finalScore')}</span>
                      </span>
                    )}
                  </div>
                  <div className="chart-container" style={{ height: '360px', position: 'relative' }} role="img" aria-label={formatLabel(chart.key)}>
                    {chart.chartType === 'bar' && <Bar data={chart.data} options={chart.options} />}
                    {chart.chartType === 'scatter' && <Scatter data={chart.data} options={chart.options} />}
                  </div>
                </Card>
              ))}
              {!charts.length && (
                <Card className="p-12 text-center lg:col-span-2">
                  <svg className="w-16 h-16 mx-auto text-primary-200 dark:text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <p className="text-primary-400 dark:text-gray-500 font-medium text-lg">{t('dashboard.noChartData') || 'No chart data available'}</p>
                  <p className="text-sm text-primary-300 dark:text-gray-600 mt-2 max-w-xs mx-auto">
                    {t('dashboard.noChartDataDesc') || 'Import a dataset with numeric columns to see visualizations.'}
                  </p>
                </Card>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Students Tab */}
      {activeTab === 'students' && (
        <div id="panel-students" role="tabpanel" aria-labelledby="tab-students" className="space-y-6 animate-slide-up">
          {/* Filters */}
          <Card className="p-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <div className="md:col-span-2">
                <label htmlFor="student-search" className="label">{t('common.search')}</label>
                <input
                  id="student-search"
                  type="search"
                  placeholder={t('common.searchPlaceholder')}
                  value={filters.q}
                  onChange={(e) => handleFilterChange('q', e.target.value)}
                  className="input"
                  aria-describedby="search-hint"
                />
                <span id="search-hint" className="sr-only">{t('common.searchPlaceholder')}</span>
              </div>
              <div>
                <label htmlFor="grade-filter" className="label">{t('common.grade')}</label>
                <select
                  id="grade-filter"
                  value={filters.grade}
                  onChange={(e) => handleFilterChange('grade', e.target.value)}
                  className="input"
                >
                  <option value="all">{t('common.allGrades')}</option>
                  {filterOptions.grades?.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="gender-filter" className="label">{t('common.gender')}</label>
                <select
                  id="gender-filter"
                  value={filters.gender}
                  onChange={(e) => handleFilterChange('gender', e.target.value)}
                  className="input"
                >
                  <option value="all">{t('common.allGenders')}</option>
                  {filterOptions.genders?.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="parttime-filter" className="label">{t('common.partTimeJob')}</label>
                <select
                  id="parttime-filter"
                  value={filters.part_time_job}
                  onChange={(e) => handleFilterChange('part_time_job', e.target.value)}
                  className="input"
                >
                  <option value="all">{t('common.all')}</option>
                  {filterOptions.partTimeJobs?.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="parental-filter" className="label">{t('common.parentalEducation')}</label>
                <select
                  id="parental-filter"
                  value={filters.parental_education}
                  onChange={(e) => handleFilterChange('parental_education', e.target.value)}
                  className="input"
                >
                  <option value="all">{t('common.all')}</option>
                  {filterOptions.parentalEducations?.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Students Table */}
          <Card className="p-0 overflow-hidden">
            <Table responsive={true}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('common.studentId')}</TableHead>
                  <TableHead scope="col">{t('common.name')}</TableHead>
                  <TableHead scope="col">{t('common.grade')}</TableHead>
                  <TableHead scope="col" align="right">{t('common.finalScore')}</TableHead>
                  <TableHead scope="col" align="right">{t('common.attendance')}</TableHead>
                  <TableHead scope="col" align="right">{t('common.studyHours')}</TableHead>
                  <TableHead scope="col" align="right">{t('common.sleepHours')}</TableHead>
                  <TableHead scope="col" align="right">{t('common.gpa')}</TableHead>
                  <TableHead scope="col">{t('common.riskLevel')}</TableHead>
                  <TableHead scope="col">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student, idx) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-mono text-primary-950 dark:text-gray-100">{student.student_id}</TableCell>
                    <TableCell className="font-medium text-primary-950 dark:text-gray-100">{student.name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${getGradeBadge(student.grade).bg} ${getGradeBadge(student.grade).text} border-2 ${getGradeBadge(student.grade).border}`}>
                        {student.grade}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.final_score}</TableCell>
                    <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.attendance_percent}%</TableCell>
                    <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.study_hours_per_day}h</TableCell>
                    <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.sleep_hours}h</TableCell>
                    <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.previous_gpa}</TableCell>
                    <TableCell>
                      {atRiskStudents.find(s => s.id === student.id) && (
                        <Badge className={`${getRiskBadge(atRiskStudents.find(s => s.id === student.id)?.risk_level).bg} ${getRiskBadge(atRiskStudents.find(s => s.id === student.id)?.risk_level).text}`}>
                          {t(`common.risk${atRiskStudents.find(s => s.id === student.id)?.risk_level}`)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCounsel(student)}
                          aria-label={t('teacher.aiCounselAria', { name: student.name })}
                        >
                          <MessageSquare className="w-4 h-4" aria-hidden="true" />
                          <span className="hidden sm:inline ml-1">{t('teacher.aiCounsel')}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleWhatIfForStudent(student)}
                          aria-label={t('teacher.whatIfSimulationAria', { name: student.name })}
                          disabled={whatIfLoading && whatIfStudent?.id === student.id}
                        >
                          {whatIfLoading && whatIfStudent?.id === student.id ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-11.582-8m0 0a8.007 8.007 0 0011.583 8z" />
                              </svg>
                              <span className="hidden sm:inline">{t('teacher.runningSimulation')}</span>
                            </>
                          ) : (
                            <>
                              {renderIcon('Sliders', { className: "w-4 h-4" })}
                              <span className="hidden sm:inline ml-1">{t('teacher.whatIfSimulation')}</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow>
                    <TableCell align="center" className="px-4 py-8 text-primary-400 dark:text-gray-500" colSpan={10}>
                      {t('common.noStudents')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-primary-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-sm text-primary-600 dark:text-gray-400" aria-live="polite">
                  {t('common.showing', { start: (pagination.page - 1) * pagination.size + 1, end: Math.min(pagination.page * pagination.size, pagination.total), total: pagination.total })}
                </p>
                <div className="flex gap-2" role="navigation" aria-label="Pagination">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    aria-label="Previous page"
                    aria-disabled={pagination.page === 1}
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{t('common.prev')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    aria-label="Next page"
                    aria-disabled={pagination.page === pagination.totalPages}
                  >
                    <span className="hidden sm:inline">{t('common.next')}</span>
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* At-Risk Tab */}
      {activeTab === 'at-risk' && (
        <div id="panel-at-risk" role="tabpanel" aria-labelledby="tab-at-risk" className="space-y-6 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-primary-950 dark:text-gray-100">
              {t('teacher.atRiskStudents', { count: atRiskStudents.length })}
            </h2>
          </div>

          {atRiskStudents.length > 0 ? (
            <Card className="p-0 overflow-hidden">
              <Table responsive={true}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('common.studentId')}</TableHead>
                    <TableHead scope="col">{t('common.name')}</TableHead>
                    <TableHead scope="col">{t('common.riskLevel')}</TableHead>
                    <TableHead scope="col" align="right">{t('common.riskScore')}</TableHead>
                    <TableHead scope="col">{t('common.riskFactors')}</TableHead>
                    <TableHead scope="col">{t('common.grade')}</TableHead>
                    <TableHead scope="col" align="right">{t('common.finalScore')}</TableHead>
                    <TableHead scope="col" align="right">{t('common.attendance')}</TableHead>
                    <TableHead scope="col" align="right">{t('common.studyHours')}</TableHead>
                    <TableHead scope="col" align="right">{t('common.gpa')}</TableHead>
                    <TableHead scope="col" align="right">{t('common.sleep')}</TableHead>
                    <TableHead scope="col">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRiskStudents.map((student, idx) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-mono text-primary-950 dark:text-gray-100">{student.student_id}</TableCell>
                      <TableCell className="font-medium text-primary-950 dark:text-gray-100">{student.name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={`${getRiskBadge(student.risk_level).bg} ${getRiskBadge(student.risk_level).text}`}>
                          {t(`common.risk${student.risk_level}`)}
                        </Badge>
                      </TableCell>
                      <TableCell align="right" className="font-bold font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.risk_score}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1" role="list" aria-label="Risk factors">
                          {student.risk_factors?.map((factor, fi) => {
                              const factorColors = {
                                attendance: { border: 'border-danger-500', text: 'text-danger-600 dark:text-danger-400' },
                                study_hours: { border: 'border-warning-500', text: 'text-warning-600 dark:text-warning-400' },
                                gpa: { border: 'border-danger-500', text: 'text-danger-600 dark:text-danger-400' },
                                sleep: { border: 'border-sky-500', text: 'text-sky-600 dark:text-sky-400' },
                              };
                              const colors = factorColors[factor.field] || { border: 'border-sky-500', text: 'text-sky-600 dark:text-sky-400' };
                              const labelKey = `common.riskFactor.${factor.field}`;
                              return (
                                <Badge
                                  key={fi}
                                  variant="outline"
                                  size="sm"
                                  className={`${colors.border} ${colors.text}`}
                                  role="listitem"
                                >
                                  {t(labelKey)}: {factor.value} {'<'} {factor.threshold}
                                </Badge>
                              );
                            })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${getGradeBadge(student.grade).bg} ${getGradeBadge(student.grade).text} border-2 ${getGradeBadge(student.grade).border}`}>
                          {student.grade}
                        </Badge>
                      </TableCell>
                      <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.final_score}</TableCell>
                      <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.attendance_percent}%</TableCell>
                      <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.study_hours_per_day}h</TableCell>
                      <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.previous_gpa}</TableCell>
                      <TableCell align="right" className="font-mono tabular-nums text-primary-950 dark:text-gray-100">{student.sleep_hours}h</TableCell>
                      <TableCell align="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCounsel(student)}
                          aria-label={t('teacher.aiCounselAria', { name: student.name })}
                        >
                          <MessageSquare className="w-4 h-4" aria-hidden="true" />
                          <span className="hidden sm:inline ml-1">{t('teacher.aiCounsel')}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              <CheckCircle className="w-16 h-16 text-success-500 mx-auto mb-4" aria-hidden="true" />
              <h3 className="text-lg font-medium text-primary-950 dark:text-gray-100 mb-2">
                {t('teacher.noAtRiskStudents')}
              </h3>
              <p className="text-primary-600 dark:text-gray-400">
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
          ariaDescribedBy="counsel-modal-desc"
        >
          <div className="space-y-4">
            <p id="counsel-modal-desc" className="text-primary-600 dark:text-gray-400">
              {t('teacher.aiCounselModalDesc')}
            </p>
            <div>
              <label htmlFor="counsel-prompt" className="label">
                {t('teacher.customPromptLabel')}
              </label>
              <textarea
                id="counsel-prompt"
                value={counselPrompt}
                onChange={(e) => setCounselPrompt(e.target.value)}
                placeholder={t('teacher.customPromptPlaceholder')}
                rows={4}
                className="input"
                aria-describedby="counsel-hint"
              />
              <span id="counsel-hint" className="sr-only">{t('teacher.customPromptPlaceholder')}</span>
            </div>
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

      {/* What-If Modal */}
      {whatIfStudent && (
        <Modal
          isOpen={!!whatIfStudent}
          onClose={() => {
            setWhatIfStudent(null);
            setWhatIfBaseline(null);
            setWhatIfSimulated(null);
            setModalWhatIfFeature('study_hours_per_day');
            setModalWhatIfValue(4);
          }}
          title={t('teacher.whatIfModalTitle', { name: whatIfStudent?.name })}
          size="lg"
          ariaDescribedBy="what-if-modal-desc"
        >
          <div className="space-y-4">
            <p id="what-if-modal-desc" className="text-primary-600 dark:text-gray-400">
              {t('teacher.whatIfModalDesc')}
            </p>
            {/* Baseline Info */}
            <div className="space-y-4">
              <h5 className="text-sm font-semibold text-primary-700 dark:text-gray-300 mb-2">
                {t('teacher.baselinePrediction')}
              </h5>
              <div className="flex items-center gap-4">
                <div className="text-xs font-mono">
                  Score: {whatIfBaseline?.final_score?.toFixed(1) ?? '—'}
                </div>
                <div className="text-xs font-mono">
                  Grade: <span className={`${getGradeBadgeClass(whatIfBaseline?.grade)}`}>
                    {whatIfBaseline?.grade ?? '—'}
                  </span>
                </div>
              </div>
            </div>
            {/* What-If Controls */}
            <div className="space-y-4">
              <h5 className="text-sm font-semibold text-primary-700 dark:text-gray-300 mb-2">
                {t('teacher.whatIfControls')}
              </h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-primary-600 dark:text-gray-300 mb-2">
                    {t('teacher.whatIfFeature')}
                  </label>
                  <select
                    id="whatif-feature-teacher"
                    className="input input-bordered w-full"
                    value={modalWhatIfFeature}
                    onChange={(e) => setModalWhatIfFeature(e.target.value)}
                  >
                    <option value="study_hours_per_day">
                      {t('student.studyHoursPerDay')}
                    </option>
                    <option value="attendance_percent">
                      {t('student.attendancePercent')}
                    </option>
                    <option value="sleep_hours">
                      {t('student.sleepHours')}
                    </option>
                    <option value="previous_gpa">
                      {t('student.previousGPA')}
                    </option>
                    <option value="age">
                      {t('common.age')}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary-600 dark:text-gray-300 mb-2">
                    {t('teacher.whatIfValue')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      id="whatif-value-teacher"
                      className="input input-bordered w-full"
                      value={modalWhatIfValue}
                      onChange={(e) => setModalWhatIfValue(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <button
                    onClick={async () => {
                      setWhatIfLoading(true);
                      try {
                        // Create a modified profile for what-if analysis
                        const modifiedProfile = {
                          gender: whatIfStudent?.gender,
                          age: whatIfStudent?.age,
                          study_hours_per_day: whatIfStudent?.study_hours_per_day,
                          attendance_percent: whatIfStudent?.attendance_percent,
                          sleep_hours: whatIfStudent?.sleep_hours,
                          previous_gpa: whatIfStudent?.previous_gpa,
                          parental_education: whatIfStudent?.parental_education,
                          internet_access: whatIfStudent?.internet_access,
                          extracurricular: whatIfStudent?.extracurricular,
                          part_time_job: whatIfStudent?.part_time_job,
                          [modalWhatIfFeature]:
                            modalWhatIfFeature === 'age' || modalWhatIfFeature === 'attendance_percent'
                              ? parseInt(modalWhatIfValue, 10)
                              : parseFloat(modalWhatIfValue)
                        };
                        const response = await api.post('/feedback', modifiedProfile);
                        setWhatIfSimulated(response);
                      } catch (err) {
                        console.error('Failed to run what-if simulation:', err);
                        addFlash(err.message, 'error');
                        setWhatIfSimulated(null);
                      } finally {
                        setWhatIfLoading(false);
                      }
                    }}
                    disabled={whatIfLoading}
                    className="btn-outline btn-primary w-full"
                  >
                    {whatIfLoading ? 'Running...' : t('teacher.runSimulation')}
                  </button>
                </div>
              </div>
              {/* What-If Result */}
              {whatIfSimulated && (
                <div className="mt-4 p-4 rounded-lg border border-primary-200 bg-primary-50">
                  <h5 className="text-sm font-semibold text-primary-700 dark:text-gray-300 mb-2">
                    {t('teacher.whatIfResult')}
                  </h5>
                  <div className="space-y-2">
                    <p className="text-xs text-primary-600 dark:text-gray-400">
                      Changing <strong className="text-primary-900 dark:text-gray-100">{modalWhatIfFeature.replace(/_/g, ' ')}</strong> to
                      <span className="font-mono">{modalWhatIfValue}</span>:
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-mono">
                        Score: {whatIfSimulated?.final_score?.toFixed(1) ?? '—'}
                      </div>
                      <div className="text-xs font-mono">
                        Grade: <span className={`${getGradeBadgeClass(whatIfSimulated?.grade)}`}>
                          {whatIfSimulated?.grade ?? '—'}
                        </span>
                      </div>
                    </div>
                    {whatIfSimulated?.final_score !== null && whatIfBaseline?.final_score !== null && (
                      <div className="text-xs text-primary-500 dark:text-gray-400 mt-1">
                        {t('teacher.change')}:
                        {(whatIfSimulated.final_score - whatIfBaseline.final_score).toFixed(1)}
                        {t('teacher.points')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}