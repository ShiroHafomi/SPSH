import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { api } from '../api';
import { renderIcon } from '../components/IconMap';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [percentiles, setPercentiles] = useState({});
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [simulated, setSimulated] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [advisorAdvice, setAdvisorAdvice] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [simInputs, setSimInputs] = useState({
    study_hours_per_day: 0,
    sleep_hours: 0,
    attendance_percent: 0,
  });

  // Fetch profile on mount
  useEffect(() => {
    fetchProfile();
    fetchAdvisor();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/student/me/profile');
      setProfile(res.student);
      setPercentiles(res.percentiles);
      setRiskAlerts(res.riskAlerts);
      // Initialize simulator with current values
      if (res.student) {
        setSimInputs({
          study_hours_per_day: res.student.study_hours_per_day || 0,
          sleep_hours: res.student.sleep_hours || 0,
          attendance_percent: res.student.attendance_percent || 0,
        });
      }
      // Get baseline prediction
      const predRes = await api.post('/student/me/simulate', {});
      setPrediction({ final_score: res.student?.final_score, grade: res.student?.grade });
      setSimulated(predRes.current);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      addFlash(t('student.profileLoadFailed'), 'error');
      if (err.status === 403) navigate(homeForRole(user?.role));
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvisor = async () => {
    try {
      const res = await api.get('/student/me/advisor');
      setAdvisorAdvice(res.advice);
    } catch (err) {
      console.error('Failed to fetch advisor:', err);
    }
  };

  const handleSimulate = async () => {
    try {
      const res = await api.post('/student/me/simulate', simInputs);
      setSimulated(res.simulated);
      setRecommendations(res.recommendations);
    } catch (err) {
      console.error('Simulation failed:', err);
      addFlash(t('student.simulationFailed'), 'error');
    }
  };

  const handleInputChange = (field, value) => {
    setSimInputs(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        {renderIcon('AlertCircle', { className: "w-12 h-12 text-danger-500 mx-auto mb-4" })}
        <h2 className="text-xl font-semibold text-primary-950 dark:text-gray-100 mb-2">
          {t('student.noProfile')}
        </h2>
        <p className="text-primary-500 dark:text-gray-400">
          {t('student.noProfileDesc')}
        </p>
      </div>
    );
  }

  const riskColors = {
    danger: 'bg-danger-500/10 border-danger-500/20 text-danger-700 dark:text-danger-300',
    warning: 'bg-warning-500/10 border-warning-500/20 text-warning-700 dark:text-warning-300',
    info: 'bg-info-500/10 border-info-500/20 text-info-700 dark:text-info-300',
  };

  const riskIcons = {
    AlertTriangle: renderIcon('AlertTriangle', { className: "w-5 h-5" }),
    BookOpen: renderIcon('BookOpen', { className: "w-5 h-5" }),
    Moon: renderIcon('Moon', { className: "w-5 h-5" }),
    Briefcase: renderIcon('Briefcase', { className: "w-5 h-5" }),
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

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-success-600 dark:text-success-400';
    if (score >= 60) return 'text-warning-600 dark:text-warning-400';
    return 'text-danger-600 dark:text-danger-400';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
            {t('student.dashboardTitle', { name: profile.name })}
          </h1>
          <p className="text-primary-500 dark:text-gray-400">
            {t('student.dashboardSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${gradeColor(profile.grade)} px-4 py-2 text-lg`}>
            {t('student.currentGrade', { grade: profile.grade })}
          </span>
        </div>
      </div>

      {/* Risk Alert Banner */}
      {riskAlerts.length > 0 && (
        <div className="space-y-3" role="alert" aria-live="polite">
          {riskAlerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-4 p-4 rounded-2xl border ${riskColors[alert.type]}`}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-current/20">
                {riskIcons[alert.icon] || riskIcons.AlertTriangle}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{alert.title}</h3>
                <p className="mt-1 text-sm">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-primary-200 dark:border-gray-700">
        <nav className="flex gap-1" role="tablist">
          {[
            { id: 'overview', label: t('student.tabOverview'), icon: renderIcon('LayoutDashboard', { className: "w-5 h-5" }) },
            { id: 'simulator', label: t('student.tabSimulator'), icon: renderIcon('Sliders', { className: "w-5 h-5" }) },
            { id: 'advisor', label: t('student.tabAdvisor'), icon: renderIcon('MessageSquare', { className: "w-5 h-5" }) },
          ].map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-t-xl text-sm font-medium transition-colors ${
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
      <div className="space-y-6">
        {/* Overview Tab - Personal Scorecard */}
        {activeTab === 'overview' && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Final Score Card */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-primary-500 dark:text-gray-400">
                  {t('student.finalScore')}
                </h3>
                <span className={`text-3xl font-bold font-mono ${getScoreColor(profile.final_score)}`}>
                  {profile.final_score}
                </span>
              </div>
              <p className="text-sm text-primary-400 dark:text-gray-500">
                {t('student.percentile', { p: percentiles.finalScore || 0 })}
              </p>
            </div>

            {/* Grade Card */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-primary-500 dark:text-gray-400">
                  {t('student.grade')}
                </h3>
                <span className={`badge ${gradeColor(profile.grade)} text-lg px-4 py-2`}>
                  {profile.grade}
                </span>
              </div>
              <p className="text-sm text-primary-400 dark:text-gray-500">
                {t('student.classPercentile', { p: percentiles.gpa || 0 })}
              </p>
            </div>

            {/* Previous GPA Card */}
            <div className="card p-6">
              <h3 className="text-sm font-medium text-primary-500 dark:text-gray-400 mb-2">
                {t('student.previousGPA')}
              </h3>
              <p className="text-3xl font-bold font-mono text-primary-950 dark:text-gray-100">
                {profile.previous_gpa?.toFixed(1) || '-'}
              </p>
              <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                {t('student.percentile', { p: percentiles.gpa || 0 })}
              </p>
            </div>

            {/* Attendance Card */}
            <div className="card p-6">
              <h3 className="text-sm font-medium text-primary-500 dark:text-gray-400 mb-2">
                {t('student.attendance')}
              </h3>
              <p className="text-3xl font-bold font-mono text-primary-950 dark:text-gray-100">
                {profile.attendance_percent}%
              </p>
              <div className="mt-3 h-2 bg-primary-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${profile.attendance_percent}%`,
                    backgroundColor:
                      profile.attendance_percent >= 75
                        ? 'rgb(16, 185, 129)'
                        : profile.attendance_percent >= 60
                        ? 'rgb(245, 158, 11)'
                        : 'rgb(239, 68, 68)',
                  }}
                />
              </div>
              <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                {t('student.percentile', { p: percentiles.attendance || 0 })}
              </p>
            </div>
          </div>
        )}

        {/* Simulator Tab */}
        {activeTab === 'simulator' && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Input Controls */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-6">
                {t('student.simulatorTitle')}
              </h3>
              <div className="space-y-6">
                {/* Study Hours */}
                <div>
                  <label className="label">{t('student.studyHours')}</label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="range"
                      min={0}
                      max={16}
                      step={0.5}
                      value={simInputs.study_hours_per_day}
                      onChange={(e) => handleInputChange('study_hours_per_day', parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-primary-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <span className="text-lg font-mono text-primary-950 dark:text-gray-100 w-16 text-right">
                      {simInputs.study_hours_per_day}h
                    </span>
                  </div>
                  <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                    {t('student.currentValue', { val: profile.study_hours_per_day })}
                  </p>
                </div>

                {/* Sleep Hours */}
                <div>
                  <label className="label">{t('student.sleepHours')}</label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={0.5}
                      value={simInputs.sleep_hours}
                      onChange={(e) => handleInputChange('sleep_hours', parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-primary-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <span className="text-lg font-mono text-primary-950 dark:text-gray-100 w-16 text-right">
                      {simInputs.sleep_hours}h
                    </span>
                  </div>
                  <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                    {t('student.currentValue', { val: profile.sleep_hours })}
                  </p>
                </div>

                {/* Attendance */}
                <div>
                  <label className="label">{t('student.attendancePercent')}</label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={simInputs.attendance_percent}
                      onChange={(e) => handleInputChange('attendance_percent', parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-primary-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <span className="text-lg font-mono text-primary-950 dark:text-gray-100 w-20 text-right">
                      {simInputs.attendance_percent}%
                    </span>
                  </div>
                  <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                    {t('student.currentValue', { val: profile.attendance_percent })}
                  </p>
                </div>

                <button
                  onClick={handleSimulate}
                  className="btn-primary w-full text-lg px-8 py-3"
                  disabled={false}
                >
                  {t('student.runSimulation')}
                </button>
              </div>
            </div>

            {/* Results Panel */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-6">
                {t('student.simulationResults')}
              </h3>

              {simulated && (
                <div className="space-y-6">
                  {/* Predicted Grade & Score */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/20">
                      <p className="text-sm text-primary-500 dark:text-gray-400">
                        {t('student.predictedScore')}
                      </p>
                      <p className={`text-3xl font-bold font-mono ${getScoreColor(simulated.final_score)}`}>
                        {simulated.final_score.toFixed(1)}
                      </p>
                      {prediction && (
                        <p className="text-sm mt-1">
                          <span className={simulated.final_score > (prediction.final_score || 0) ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}>
                            {simulated.final_score > (prediction.final_score || 0) ? '+' : ''}
                            {(simulated.final_score - (prediction.final_score || 0)).toFixed(1)}
                          </span>
                          {t('student.vsCurrent')}
                        </p>
                      )}
                    </div>
                    <div className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/20">
                      <p className="text-sm text-primary-500 dark:text-gray-400">
                        {t('student.predictedGrade')}
                      </p>
                      <span className={`badge ${gradeColor(simulated.grade)} text-2xl px-6 py-3`}>
                        {simulated.grade}
                      </span>
                    </div>
                  </div>

                  {/* Grade Probabilities */}
                  {simulated.grade_probabilities && (
                    <div>
                      <h4 className="text-sm font-medium text-primary-950 dark:text-gray-100 mb-3">
                        {t('student.gradeProbabilities')}
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(simulated.grade_probabilities)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([grade, prob]) => (
                            <div key={grade} className="flex items-center gap-3">
                              <span className={`badge ${gradeColor(grade)} w-10 text-center text-sm`}>
                                {grade}
                              </span>
                              <div className="flex-1 h-3 bg-primary-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${prob * 100}%`,
                                    backgroundColor:
                                      grade === 'A'
                                        ? 'rgb(16, 185, 129)'
                                      : grade === 'B'
                                        ? 'rgb(56, 189, 248)'
                                      : grade === 'C'
                                        ? 'rgb(245, 158, 11)'
                                      : grade === 'D'
                                        ? 'rgb(251, 146, 60)'
                                        : 'rgb(239, 68, 68)',
                                  }}
                                />
                              </div>
                              <span className="text-sm font-mono w-12 text-right text-primary-950 dark:text-gray-100">
                                {(prob * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {recommendations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-primary-950 dark:text-gray-100 mb-3">
                        {t('student.recommendations')}
                      </h4>
                      <div className="space-y-2">
                        {recommendations.map((rec, idx) => {
                          const recColors = {
                            positive: 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300',
                            warning: 'bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-300',
                            danger: 'bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300',
                            info: 'bg-info-50 dark:bg-info-900/20 text-info-700 dark:text-info-300',
                          };
                          const iconMap = {
                            TrendingUp: renderIcon('TrendingUp', { className: "w-5 h-5" }),
                            BookOpen: riskIcons.BookOpen,
                            Moon: riskIcons.Moon,
                            AlertTriangle: riskIcons.AlertTriangle,
                            Briefcase: riskIcons.Briefcase,
                          };
                          return (
                            <div
                              key={idx}
                              className={`flex items-start gap-3 p-3 rounded-xl ${recColors[rec.type] || recColors.info}`}
                            >
                              <div className="flex-shrink-0 w-5 h-5">
                                {iconMap[rec.icon] || riskIcons.AlertTriangle}
                              </div>
                              <div>
                                <p className="font-medium">{rec.title}</p>
                                <p className="text-sm mt-0.5">{rec.message}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!simulated && (
                <div className="text-center py-12 text-primary-400 dark:text-gray-500">
                  <p>{t('student.adjustSliders')}</p>
                  <p className="text-sm mt-2">{t('student.adjustSlidersDesc')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Advisor Tab */}
        {activeTab === 'advisor' && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">
              {t('student.aiAdvisor')}
            </h3>
            {advisorAdvice ? (
              <div className="prose prose-primary dark:prose-invert max-w-none whitespace-pre-wrap">
                {advisorAdvice}
              </div>
            ) : (
              <div className="text-center py-12 text-primary-400 dark:text-gray-500">
                {renderIcon('Loader2', { className: "w-8 h-8 mx-auto mb-4 animate-spin" })}
                <p>{t('student.loadingAdvice')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}