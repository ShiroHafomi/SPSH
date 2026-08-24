import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { api } from '../api';
import { renderIcon } from '../components/IconMap';
import { GRADE_COLORS, getGradeBadgeClass } from '../utils/chartTheme';

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
  const [profileForm, setProfileForm] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);

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
        // Initialize profile form
        setProfileForm({
          gender: res.student.gender || '',
          age: res.student.age || '',
          study_hours_per_day: res.student.study_hours_per_day || '',
          attendance_percent: res.student.attendance_percent || '',
          sleep_hours: res.student.sleep_hours || '',
          previous_gpa: res.student.previous_gpa || '',
          parental_education: res.student.parental_education || '',
          internet_access: res.student.internet_access ? 'Yes' : 'No',
          extracurricular: res.student.extracurricular ? 'Yes' : 'No',
          part_time_job: res.student.part_time_job ? 'Yes' : 'No',
          notes: res.student.notes || '',
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

  const handleProfileChange = (field, value) => {
    setProfileForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    try {
      setProfileSaving(true);
      const res = await api.put('/student/me/profile', profileForm);
      setProfile(res.student);
      // Re-initialize form with updated data
      setProfileForm({
        gender: res.student.gender || '',
        age: res.student.age || '',
        study_hours_per_day: res.student.study_hours_per_day || '',
        attendance_percent: res.student.attendance_percent || '',
        sleep_hours: res.student.sleep_hours || '',
        previous_gpa: res.student.previous_gpa || '',
        parental_education: res.student.parental_education || '',
        internet_access: res.student.internet_access ? 'Yes' : 'No',
        extracurricular: res.student.extracurricular ? 'Yes' : 'No',
        part_time_job: res.student.part_time_job ? 'Yes' : 'No',
        notes: res.student.notes || '',
      });
      addFlash(t('student.profileSaved'), 'success');
    } catch (err) {
      console.error('Failed to save profile:', err);
      addFlash(t('student.profileSaveFailed'), 'error');
    } finally {
      setProfileSaving(false);
    }
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
    danger: 'border-danger-500 bg-danger-50 text-danger-700 dark:bg-danger-950/30 dark:text-danger-300',
    warning: 'border-warning-500 bg-warning-50 text-warning-700 dark:bg-warning-950/30 dark:text-warning-300',
    info: 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300',
  };

  const riskIcons = {
    AlertTriangle: renderIcon('AlertTriangle', { className: "w-5 h-5" }),
    BookOpen: renderIcon('BookOpen', { className: "w-5 h-5" }),
    Moon: renderIcon('Moon', { className: "w-5 h-5" }),
    Briefcase: renderIcon('Briefcase', { className: "w-5 h-5" }),
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
          <span className={`${getGradeBadgeClass(profile.grade)} px-4 py-2 text-lg`}>
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
              className={`card-clay flex items-start gap-4 p-4 border-l-4 ${riskColors[alert.type] || riskColors.info}`}
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
            { id: 'editProfile', label: t('student.tabEditProfile'), icon: renderIcon('UserPen', { className: "w-5 h-5" }) },
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
          <>
            {/* Quick What-If Widget */}
            <div className="card p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100">
                  Quick What-If: Study Hours
                </h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary-600 dark:text-gray-300 mb-2">
                    Study Hours per Day
                  </label>
                  <div className="flex items-center gap-4">
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
                    Current: {profile.study_hours_per_day}h
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-primary-500 dark:text-gray-400">
                      Predicted Score:
                    </p>
                    <p className="text-2xl font-bold font-mono">
                      {simulated?.final_score?.toFixed(1) ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-primary-500 dark:text-gray-400">
                      Predicted Grade:
                    </p>
                    <span className={`${getGradeBadgeClass(simulated?.grade)} text-lg px-3 py-1`}>
                      {simulated?.grade ?? '—'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    // Trigger simulation to update the simulated state
                    handleSimulate();
                  }}
                  className="btn-outline btn-primary w-full"
                >
                  Run Quick Simulation
                </button>
              </div>
            </div>

            {/* Scorecard Grid */}
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
                  <span className={`${getGradeBadgeClass(profile.grade)} text-lg px-4 py-2`}>
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
                    className={`h-full rounded-full transition-all duration-300 ${
                      profile.attendance_percent >= 75
                        ? 'bg-success-500'
                        : profile.attendance_percent >= 60
                        ? 'bg-warning-500'
                        : 'bg-danger-500'
                    }`}
                    style={{ width: `${profile.attendance_percent}%` }}
                  />
                </div>
                <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
                  {t('student.percentile', { p: percentiles.attendance || 0 })}
                </p>
              </div>
            </div>
          </>
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
                      <span className={`${getGradeBadgeClass(simulated.grade)} text-2xl px-6 py-3`}>
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
                              <span className={`${getGradeBadgeClass(grade)} w-10 justify-center text-sm`}>
                                {grade}
                              </span>
                              <div className="flex-1 h-3 bg-primary-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${prob * 100}%`,
                                    backgroundColor: (GRADE_COLORS[grade] || {}).solid || 'rgb(148,163,184)',
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
                            info: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300',
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

        {/* Edit Profile Tab */}
        {activeTab === 'editProfile' && (
          <div className="card p-6 max-w-2xl">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-2">
                {t('student.editProfileTitle')}
              </h3>
              <p className="text-primary-500 dark:text-gray-400">{t('student.editProfileSubtitle')}</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                {/* Gender */}
                <div>
                  <label className="label">{t('student.gender')} <span className="text-danger-500">*</span></label>
                  <select
                    value={profileForm.gender}
                    onChange={(e) => handleProfileChange('gender', e.target.value)}
                    className="input mt-1"
                    required
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="Male">{t('student.male')}</option>
                    <option value="Female">{t('student.female')}</option>
                  </select>
                </div>

                {/* Age */}
                <div>
                  <label className="label">{t('student.age')} <span className="text-danger-500">*</span></label>
                  <input
                    type="number"
                    min="15"
                    max="30"
                    value={profileForm.age}
                    onChange={(e) => handleProfileChange('age', e.target.value)}
                    className="input mt-1"
                    required
                  />
                </div>

                {/* Study Hours Per Day */}
                <div>
                  <label className="label">{t('student.studyHoursPerDay')}</label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={profileForm.study_hours_per_day}
                    onChange={(e) => handleProfileChange('study_hours_per_day', e.target.value)}
                    className="input mt-1"
                  />
                </div>

                {/* Attendance Percent */}
                <div>
                  <label className="label">{t('student.attendancePercent')}</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={profileForm.attendance_percent}
                    onChange={(e) => handleProfileChange('attendance_percent', e.target.value)}
                    className="input mt-1"
                  />
                </div>

                {/* Sleep Hours */}
                <div>
                  <label className="label">{t('student.sleepHours')}</label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={profileForm.sleep_hours}
                    onChange={(e) => handleProfileChange('sleep_hours', e.target.value)}
                    className="input mt-1"
                  />
                </div>

                {/* Previous GPA */}
                <div>
                  <label className="label">{t('student.previousGPA')}</label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.1"
                    value={profileForm.previous_gpa}
                    onChange={(e) => handleProfileChange('previous_gpa', e.target.value)}
                    className="input mt-1"
                  />
                </div>

                {/* Parental Education */}
                <div>
                  <label className="label">{t('student.parentalEducation')}</label>
                  <select
                    value={profileForm.parental_education}
                    onChange={(e) => handleProfileChange('parental_education', e.target.value)}
                    className="input mt-1"
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="High School">{t('student.highSchool')}</option>
                    <option value="Bachelor">{t('student.bachelors')}</option>
                    <option value="Master">{t('student.masters')}</option>
                    <option value="PhD">{t('student.phd')}</option>
                  </select>
                </div>

                {/* Internet Access */}
                <div>
                  <label className="label">{t('student.internetAccess')}</label>
                  <select
                    value={profileForm.internet_access}
                    onChange={(e) => handleProfileChange('internet_access', e.target.value)}
                    className="input mt-1"
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="Yes">{t('student.yes')}</option>
                    <option value="No">{t('student.no')}</option>
                  </select>
                </div>

                {/* Extracurricular */}
                <div>
                  <label className="label">{t('student.extracurricular')}</label>
                  <select
                    value={profileForm.extracurricular}
                    onChange={(e) => handleProfileChange('extracurricular', e.target.value)}
                    className="input mt-1"
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="Yes">{t('student.yes')}</option>
                    <option value="No">{t('student.no')}</option>
                  </select>
                </div>

                {/* Part-Time Job */}
                <div>
                  <label className="label">{t('student.partTimeJob')}</label>
                  <select
                    value={profileForm.part_time_job}
                    onChange={(e) => handleProfileChange('part_time_job', e.target.value)}
                    className="input mt-1"
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="Yes">{t('student.yes')}</option>
                    <option value="No">{t('student.no')}</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="label">{t('student.notes')}</label>
                <textarea
                  value={profileForm.notes}
                  onChange={(e) => handleProfileChange('notes', e.target.value)}
                  rows={3}
                  className="input mt-1"
                  placeholder="Add any additional notes..."
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-primary-200 dark:border-gray-700">
                <button
                  type="submit"
                  className="btn-primary px-8 py-2.5"
                  disabled={profileSaving}
                >
                  {profileSaving ? t('student.saving') : t('student.saveProfile')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}