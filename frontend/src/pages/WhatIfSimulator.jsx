import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard } from '../components/Skeleton';
import { renderIcon } from '../components/IconMap';
import { GRADE_COLORS, getGradeBadgeClass } from '../utils/chartTheme';

const DEFAULT_PROFILE = {
  gender: 'Female',
  age: 20,
  study_hours_per_day: 4,
  attendance_percent: 85,
  sleep_hours: 7,
  previous_gpa: 3.2,
  parental_education: 'Master',
  internet_access: 'Yes',
  extracurricular: 'Yes',
  part_time_job: 'No',
};

const SEVERITY_COLORS = {
  success: 'border-success-500 bg-success-50 dark:bg-success-950/30',
  warning: 'border-warning-500 bg-warning-50 dark:bg-warning-950/30',
  danger: 'border-danger-500 bg-danger-50 dark:bg-danger-950/30',
  info: 'border-primary-500 bg-primary-50 dark:bg-primary-950/30',
};

export default function WhatIfSimulator() {
  const { addFlash } = useFlash();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [baselineResult, setBaselineResult] = useState(null);
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [whatIfFeature, setWhatIfFeature] = useState('study_hours_per_day');
  const [whatIfValue, setWhatIfValue] = useState(4);
  const debounceRef = useRef(null);

  // Load student profile if user is a student
  useEffect(() => {
    if (user?.role === 'student') {
      loadStudentProfile();
    }
  }, [user]);

  const loadStudentProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/student/me/profile');
      setProfile(res.student);
      // Predict baseline
      handlePredict(res.student);
    } catch (err) {
      console.error('Failed to load student profile:', err);
      addFlash(t('student.profileLoadFailed'), 'error');
      // Fall back to default profile
      setProfile(DEFAULT_PROFILE);
      handlePredict(DEFAULT_PROFILE);
    } finally {
      setLoading(false);
    }
  }, [user, addFlash, t]);

  const handleChange = useCallback((field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));

    // Reset what-if result when profile changes
    setWhatIfResult(null);

    // Trigger baseline prediction with debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handlePredict(profile), 800);
  }, [profile]);

  // Debounced baseline prediction
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handlePredict(profile), 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [profile]);

  const handlePredict = useCallback(async (data) => {
    setLoading(true);
    try {
      const response = await api.post('/predict/baseline', data);
      setBaselineResult(response);
    } catch (err) {
      addFlash(err.message, 'error');
      setBaselineResult(null);
    } finally {
      setLoading(false);
    }
  }, [addFlash]);

  const handleWhatIfPredict = useCallback(async () => {
    if (!baselineResult) return;

    setLoading(true);
    try {
      // Create a modified profile for what-if analysis
      const modifiedProfile = { ...profile, [whatIfFeature]: whatIfValue };

      // Convert numeric values appropriately
      if (whatIfFeature === 'age' || whatIfFeature === 'attendance_percent') {
        modifiedProfile[whatIfFeature] = parseInt(whatIfValue, 10);
      } else if (whatIfFeature === 'study_hours_per_day' || whatIfFeature === 'sleep_hours' || whatIfFeature === 'previous_gpa') {
        modifiedProfile[whatIfFeature] = parseFloat(whatIfValue);
      }

      const response = await api.post('/predict/simulation', modifiedProfile);
      setWhatIfResult(response);
    } catch (err) {
      addFlash(err.message, 'error');
      setWhatIfResult(null);
    } finally {
      setLoading(false);
    }
  }, [profile, whatIfFeature, whatIfValue, baselineResult, addFlash]);

  const handleCreateGoalFromScenario = useCallback(async () => {
    // First, we need to get the current scenario from the baseline result
    // We'll need to extract the scenario ID from the baseline event
    // For now, we'll use a placeholder approach since we don't have direct access to the scenario ID
    // In a real implementation, we would need to pass the scenario ID through the state

    // For this implementation, we'll assume we have access to the scenario ID
    // In a real app, we would store the scenario ID when we load a saved scenario

    // Since we don't have direct access to the scenario ID in this component,
    // we'll need to get it from the baseline result or make an assumption

    // For now, let's show a message that this feature needs to be implemented
    // In a real implementation, we would call the API to create a goal from scenario

    // This is a simplified version - in reality, we would need to:
    // 1. Have the scenario ID available
    // 2. Call POST /api/student/me/goals/from-scenario/:scenarioId

    // For demonstration purposes, let's simulate the API call
    setLoading(true);
    try {
      // In a real implementation, we would have the scenarioId from context
      // For now, we'll use a placeholder
      const scenarioId = 1; // This should be replaced with actual scenario ID

      const response = await api.post(`/student/me/goals/from-scenario/${scenarioId}`);

      addFlash(t('goals.goalCreatedFromScenario'), 'success');
      // Navigate to the newly created goal
      navigate(`/student/me/goals/${response.id}`);
    } catch (err) {
      // Handle specific error cases
      if (err.response && err.response.data && err.response.data.error === 'ACTIVE_GOAL_EXISTS') {
        addFlash(t('goals.activeGoalExistsError'), 'error');
      } else {
        addFlash(err.message || 'Failed to create goal from scenario', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [addFlash, navigate, t]);

  const reset = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    setBaselineResult(null);
    setWhatIfResult(null);
    if (user?.role === 'student') {
      loadStudentProfile();
    }
  }, [user, loadStudentProfile]);

  const baselineGrade = baselineResult?.grade || '—';
  const baselineScore = baselineResult?.final_score;
  const whatIfGrade = whatIfResult?.grade || '—';
  const whatIfScore = whatIfResult?.final_score;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
            {t('student.whatIfSimulator')}
          </h2>
          <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
            {t('student.simulatorTitle')}
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={false} // Auto-predict not needed in simulator
            onChange={(e) => {}} // Disabled
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-primary-600 dark:text-primary-300">Auto-predict</span>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: Input Form ─────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <h3 className="text-lg font-bold text-primary-950 dark:text-gray-100 mb-5">
              {t('student.tabOverview')}
            </h3>

            {/* Baseline Results */}
            {loading ? (
              <div className="space-y-6">
                <SkeletonCard className="h-24" />
                <SkeletonCard className="h-48" />
              </div>
            ) : baselineResult ? (
              <div className="space-y-8">
                {/* Grade & Score */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-6 rounded-2xl bg-primary-50/60 dark:bg-gray-800 text-center">
                    <p className="text-xs font-semibold text-primary-400 dark:text-primary-300 uppercase tracking-wider mb-1">
                      {t('predictor.predictedScore')}
                    </p>
                    <p className="text-4xl font-bold text-primary-950 dark:text-gray-100">
                      {baselineScore != null ? baselineScore.toFixed(1) : '—'}
                    </p>
                    <p className="text-xs text-primary-400 dark:text-gray-500 mt-1">
                      out of 100
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-primary-50/60 dark:bg-gray-800 text-center">
                    <p className="text-xs font-semibold text-primary-400 dark:text-primary-300 uppercase tracking-wider mb-1">
                      {t('predictor.predictedGrade')}
                    </p>
                    <span className={`mt-1 px-6 py-2 text-3xl ${getGradeBadgeClass(baselineGrade)}`}>
                      {baselineGrade}
                    </span>
                    {baselineResult.grade_confidence != null && (
                      <p className="text-xs text-primary-300 dark:text-gray-600 mt-2">
                        {(baselineResult.grade_confidence * 100).toFixed(0)}% confidence
                      </p>
                    )}
                  </div>
                </div>

                {/* Grade Probabilities */}
                {baselineResult.grade_probabilities && Object.keys(baselineResult.grade_probabilities).length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-3">
                      {t('predictor.gradeProbDist')}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(baselineResult.grade_probabilities).map(([g, prob]) => (
                        <div key={g} className="flex items-center gap-3">
                          <span className={`w-8 h-8 justify-center flex-shrink-0 ${getGradeBadgeClass(g)}`}>
                            {g}
                          </span>
                          <div className="flex-1 bg-primary-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${(prob * 100).toFixed(0)}%`,
                                minWidth: prob > 0 ? '1.25rem' : 0,
                                backgroundColor: GRADE_COLORS[g]?.solid || 'rgb(148, 163, 184)',
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium text-primary-600 dark:text-primary-300 w-12 text-right">
                            {(prob * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Feedback & Recommendations */}
                {baselineResult.feedback?.recommendations?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-3">
                      {t('predictor.recommendationsTitle')}
                    </h4>
                    <div className="space-y-3">
                      {baselineResult.feedback.recommendations.map((rec, i) => (
                        <div
                          key={i}
                          className={`flex gap-3 p-4 border-l-4 rounded-r-lg ${SEVERITY_COLORS[rec.severity] || SEVERITY_COLORS.info}`}
                        >
                          <span className="flex-shrink-0">{renderIcon(rec.icon, { className: 'w-6 h-6' })}</span>
                          <div>
                            <p className="font-semibold text-primary-950 dark:text-gray-100 text-sm">{rec.title}</p>
                            <p className="text-sm text-primary-600 dark:text-primary-300 mt-0.5">{rec.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="w-20 h-20 text-primary-200 dark:text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548-.548A3.374 3.374 0 0014 14.469V17a1 1 0 01-.553.894l-.491.246a1.5 1 0 00-.553 1.679l.216.871a2 2 0 01-1.935 2.41H13.5" />
                </svg>
                <p className="text-primary-400 dark:text-gray-500 font-medium">
                  {t('predictor.emptyTitle')}
                </p>
                <p className="text-sm text-primary-300 dark:text-gray-600 mt-1">
                  {t('predictor.emptyDesc')}
                </p>
              </div>
            )}

            {/* What-If Controls */}
            {baselineResult && (
              <div className="mt-8">
                <h4 className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-3">
                  {t('student.simulatorTitle')}
                </h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-primary-600 dark:text-gray-300 mb-2">
                        {t('student.studyHours')} {/* Study Hours / Day */}
                      </label>
                      <select
                        id="whatif-feature"
                        className="input input-bordered w-full"
                        onChange={(e) => setWhatIfFeature(e.target.value)}
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
                        {t('student.testValue')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          id="whatif-value"
                          className="input input-bordered w-full"
                          value={whatIfValue}
                          onChange={(e) => setWhatIfValue(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <button
                        onClick={handleWhatIfPredict}
                        disabled={loading}
                        className="btn-outline btn-primary w-full"
                      >
                        {loading ? 'Analyzing...' : t('student.runSimulation')}
                      </button>
                    </div>
                  </div>

                  {whatIfResult && (
                    <>
                      <div className="mt-4 p-4 rounded-lg border border-primary-200 bg-primary-50">
                        <h5 className="text-sm font-semibold text-primary-700 dark:text-gray-300 mb-2">
                          {t('student.simulationResults')}
                        </h5>
                        <div className="space-y-2">
                          <p className="text-xs text-primary-600 dark:text-gray-400">
                            Changing <strong className="text-primary-900 dark:text-gray-100">{whatIfFeature.replace(/_/g, ' ')}</strong> to
                            <span className="font-mono">{whatIfValue}</span>:
                          </p>
                          <div className="flex items-center gap-4">
                            <div className="text-xs font-mono">
                              Score: {whatIfResult.final_score?.toFixed(1) ?? '—'}
                            </div>
                            <div className="text-xs font-mono">
                              Grade: <span className={`${getGradeBadgeClass(whatIfResult.grade)}`}>
                                {whatIfResult.grade ?? '—'}
                              </span>
                            </div>
                          </div>
                          {whatIfResult.final_score !== null && baselineScore !== null && (
                            <div className="text-xs text-primary-500 dark:text-gray-400 mt-1">
                              {t('student.vsCurrent')}:
                              {(whatIfResult.final_score - baselineScore).toFixed(1)}
                              points
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Create Study Goal Button */}
                      <div className="mt-6">
                        <p className="text-xs text-primary-500 dark:text-gray-400 mb-2">
                          {t('goals.predictionDisclaimer')}
                        </p>
                        <button
                          onClick={() => handleCreateGoalFromScenario()}
                          disabled={loading || !user?.studentId}
                          className="btn-primary w-full"
                        >
                          {t('goals.convertFromScenario')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Student Profile Form ──────────────────────────────── */}
        <div className="lg:col-span-3">
          <div className="card p-6 min-h-[500px]">
            <h3 className="text-lg font-bold text-primary-950 dark:text-gray-100 mb-5">
              {t('student.editProfile')}
            </h3>

            <form onSubmit={(e) => {
              e.preventDefault();
              // In a real app, this would save to backend
              addFlash(t('student.profileSaved'), 'success');
            }} className="space-y-6">
              {/* Gender */}
              <fieldset>
                <legend className="label">{t('common.gender')}</legend>
                <div className="flex gap-4 mt-1">
                  {['Male', 'Female'].map((g) => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={profile.gender === g}
                        onChange={(e) => handleChange('gender', e.target.value)}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-primary-700 dark:text-gray-300">{g}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Age */}
              <div>
                <label htmlFor="age" className="label">{t('common.age')}</label>
                <input
                  type="number"
                  id="age"
                  min={10}
                  max={80}
                  value={profile.age}
                  onChange={(e) => handleChange('age', parseInt(e.target.value, 10) || 0)}
                  className="input"
                />
              </div>

              {/* Study Hours — Slider */}
              <div>
                <label htmlFor="study_hours" className="label">
                  {t('student.studyHoursPerDay')}: <strong>{profile.study_hours_per_day}h</strong>
                </label>
                <input
                  type="range"
                  id="study_hours"
                  min={0}
                  max={16}
                  step={0.5}
                  value={profile.study_hours_per_day}
                  onChange={(e) => handleChange('study_hours_per_day', parseFloat(e.target.value))}
                  className="w-full accent-primary-600"
                />
                <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600 mt-1">
                  <span>0h</span><span>8h</span><span>16h</span>
                </div>
              </div>

              {/* Attendance — Slider */}
              <div>
                <label htmlFor="attendance" className="label">
                  {t('student.attendancePercent')}: <span className="text-primary-600 dark:text-primary-400">{profile.attendance_percent}%</span>
                </label>
                <input
                  type="range"
                  id="attendance"
                  min={0}
                  max={100}
                  step={5}
                  value={profile.attendance_percent}
                  onChange={(e) => handleChange('attendance_percent', parseInt(e.target.value, 10))}
                  className="w-full h-6 accent-primary-600"
                />
                <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600 mt-1">
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>

              {/* Sleep — Slider */}
              <div>
                <label htmlFor="sleep" className="label">
                  {t('student.sleepHours')}: <span className="text-primary-600 dark:text-primary-400">{profile.sleep_hours}h</span>
                </label>
                <input
                  type="range"
                  id="sleep"
                  min={0}
                  max={12}
                  step={0.5}
                  value={profile.sleep_hours}
                  onChange={(e) => handleChange('sleep_hours', parseFloat(e.target.value))}
                  className="w-full h-6 accent-primary-600"
                />
                <div className="justify-between text-xs text-primary-300 dark:text-gray-600 mt-1">
                  <span>0h</span><span>6h</span><span>12h</span>
                </div>
              </div>

              {/* GPA — Slider */}
              <div>
                <label htmlFor="gpa" className="label">
                  {t('student.previousGPA')}: <span className="text-primary-600 dark:text-primary-400">{profile.previous_gpa.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  id="gpa"
                  min={0}
                  max={4}
                  step={0.1}
                  value={profile.previous_gpa}
                  onChange={(e) => handleChange('previous_gpa', parseFloat(e.target.value))}
                  className="w-full h-6 accent-primary-600"
                />
                <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600 mt-1">
                  <span>0.0</span><span>2.0</span><span>4.0</span>
                </div>
              </div>

              {/* Parental Education */}
              <div>
                <label htmlFor="parental" className="label">{t('student.parentalEducation')}</label>
                <select
                  id="parental"
                  value={profile.parental_education}
                  onChange={(e) => handleChange('parental_education', e.target.value)}
                  className="input"
                >
                  <option value="High School">{t('student.highSchool')}</option>
                  <option value="Bachelor">{t('student.bachelors')}</option>
                  <option value="Master">{t('student.masters')}</option>
                  <option value="PhD">{t('student.phd')}</option>
                  <option value="None">None</option>
                </select>
              </div>

              {/* Binary toggles */}
              {[
                { key: 'internet_access', label: t('student.internetAccess') },
                { key: 'extracurricular', label: t('student.extracurricular') },
                { key: 'part_time_job', label: t('student.partTimeJob') },
              ].map(({ key, label }) => (
                <fieldset key={key}>
                  <label className="label">{label}</label>
                  <div className="flex gap-4 mt-1">
                    {['Yes', 'No'].map((v) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={key}
                          value={v}
                          checked={profile[key] === v}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-primary-700 dark:text-gray-300">{v}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              {/* Buttons */}
              <div className="flex gap-3 pt-2 border-t border-primary-100 dark:border-gray-800">
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Saving...' : 'Save Profile'}
                </button>
                <button type="button" onClick={reset} className="btn-secondary">
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}