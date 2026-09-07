import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { useAuth } from '../hooks/useAuth';
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

const PROFILE_FIELDS = Object.keys(DEFAULT_PROFILE);
const GENDERS = ['Male', 'Female'];
const PARENTAL_EDUCATION_LEVELS = ['High School', 'Bachelor', 'Master', 'PhD'];

function normalizeProfile(student = {}) {
  const normalizeBoolean = (value, fallback) => {
    const normalized = String(value).toLowerCase();
    if (value === true || value === 1 || normalized === 'yes') return 'Yes';
    if (value === false || value === 0 || normalized === 'no') return 'No';
    return fallback;
  };
  const normalizeNumber = (value, fallback) => {
    if (value == null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  return {
    gender: GENDERS.includes(student.gender) ? student.gender : DEFAULT_PROFILE.gender,
    age: normalizeNumber(student.age, DEFAULT_PROFILE.age),
    study_hours_per_day: normalizeNumber(student.study_hours_per_day, DEFAULT_PROFILE.study_hours_per_day),
    attendance_percent: normalizeNumber(student.attendance_percent, DEFAULT_PROFILE.attendance_percent),
    sleep_hours: normalizeNumber(student.sleep_hours, DEFAULT_PROFILE.sleep_hours),
    previous_gpa: normalizeNumber(student.previous_gpa, DEFAULT_PROFILE.previous_gpa),
    parental_education: PARENTAL_EDUCATION_LEVELS.includes(student.parental_education)
      ? student.parental_education
      : DEFAULT_PROFILE.parental_education,
    internet_access: normalizeBoolean(student.internet_access, DEFAULT_PROFILE.internet_access),
    extracurricular: normalizeBoolean(student.extracurricular, DEFAULT_PROFILE.extracurricular),
    part_time_job: normalizeBoolean(student.part_time_job, DEFAULT_PROFILE.part_time_job),
  };
}

function buildProfilePayload(profile) {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile[field]]));
}

export default function WhatIfSimulator() {
  const { addFlash } = useFlash();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [baselineResult, setBaselineResult] = useState(null);
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [whatIfFeature, setWhatIfFeature] = useState('study_hours_per_day');
  const [whatIfValue, setWhatIfValue] = useState(4);
  const debounceRef = useRef(null);
  const predictRequestRef = useRef(0);

  const handlePredict = useCallback(async (data) => {
    const requestId = predictRequestRef.current + 1;
    predictRequestRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.post('/predict/baseline', data);
      if (predictRequestRef.current === requestId) setBaselineResult(response);
    } catch (err) {
      if (predictRequestRef.current === requestId) {
        addFlash(err.message || t('student.simulationFailed'), 'error');
        setBaselineResult(null);
      }
    } finally {
      if (predictRequestRef.current === requestId) setLoading(false);
    }
  }, [addFlash, t]);

  const loadStudentProfile = useCallback(async () => {
    predictRequestRef.current += 1;
    setLoading(true);
    setProfileReady(false);
    try {
      const response = await api.get('/student/me/profile');
      setProfile(normalizeProfile(response.student));
    } catch (err) {
      console.error('Failed to load student profile:', err);
      addFlash(t('student.profileLoadFailed'), 'error');
      setProfile(DEFAULT_PROFILE);
    } finally {
      setProfileReady(true);
    }
  }, [addFlash, t]);

  useEffect(() => {
    if (user?.role === 'student') {
      loadStudentProfile();
    } else {
      setProfile(DEFAULT_PROFILE);
      setProfileReady(true);
    }
  }, [loadStudentProfile, user?.role]);

  useEffect(() => {
    if (!profileReady) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handlePredict(profile), 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [handlePredict, profile, profileReady]);

  const handleChange = useCallback((field, value) => {
    predictRequestRef.current += 1;
    setLoading(true);
    setProfile((current) => ({ ...current, [field]: value }));
    setWhatIfResult(null);
  }, []);

  const handleWhatIfPredict = useCallback(async () => {
    if (!baselineResult) return;

    setSimulationLoading(true);
    try {
      const modifiedProfile = { ...profile, [whatIfFeature]: whatIfValue };

      if (whatIfFeature === 'age' || whatIfFeature === 'attendance_percent') {
        modifiedProfile[whatIfFeature] = parseInt(whatIfValue, 10);
      } else if (whatIfFeature === 'study_hours_per_day' || whatIfFeature === 'sleep_hours' || whatIfFeature === 'previous_gpa') {
        modifiedProfile[whatIfFeature] = parseFloat(whatIfValue);
      }

      const response = await api.post('/predict/simulation', modifiedProfile);
      setWhatIfResult(response);
    } catch (err) {
      addFlash(err.message || t('student.simulationFailed'), 'error');
      setWhatIfResult(null);
    } finally {
      setSimulationLoading(false);
    }
  }, [profile, whatIfFeature, whatIfValue, baselineResult, addFlash, t]);

  const handleSaveProfile = useCallback(async (event) => {
    event.preventDefault();
    if (user?.role !== 'student' || profileSaving) return;

    setProfileSaving(true);
    try {
      const response = await api.put('/student/me/profile', buildProfilePayload(profile));
      predictRequestRef.current += 1;
      setLoading(true);
      setProfile(normalizeProfile(response.student));
      addFlash(t('student.profileSaved'), 'success');
    } catch (err) {
      addFlash(err.message || t('student.profileSaveFailed'), 'error');
    } finally {
      setProfileSaving(false);
    }
  }, [addFlash, profile, profileSaving, t, user?.role]);

  const reset = useCallback(() => {
    predictRequestRef.current += 1;
    setLoading(true);
    setBaselineResult(null);
    setWhatIfResult(null);
    if (user?.role === 'student') {
      loadStudentProfile();
    } else {
      setProfile(DEFAULT_PROFILE);
      setProfileReady(true);
    }
  }, [loadStudentProfile, user?.role]);

  const baselineGrade = baselineResult?.grade || '—';
  const baselineScore = baselineResult?.final_score;
  const whatIfFeatureLabel = t({
    study_hours_per_day: 'student.studyHoursPerDay',
    attendance_percent: 'student.attendancePercent',
    sleep_hours: 'student.sleepHours',
    previous_gpa: 'student.previousGPA',
    age: 'common.age',
  }[whatIfFeature]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
          {t('student.whatIfSimulator')}
        </h2>
        <p className="mt-1 text-sm text-primary-400 dark:text-gray-500">
          {t('student.simulatorSubtitle')}
        </p>
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
                    <p className="mt-1 text-xs text-primary-400 dark:text-gray-500">
                      {t('predictor.outOf100')}
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
                      <p className="mt-2 text-xs text-primary-300 dark:text-gray-600">
                        {t('dashboard.confidence', { pct: (baselineResult.grade_confidence * 100).toFixed(0) })}
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
                      <label htmlFor="whatif-feature" className="mb-2 block text-sm font-medium text-primary-600 dark:text-gray-300">
                        {t('student.testField')}
                      </label>
                      <select
                        id="whatif-feature"
                        value={whatIfFeature}
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
                      <label htmlFor="whatif-value" className="mb-2 block text-sm font-medium text-primary-600 dark:text-gray-300">
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
                        type="button"
                        onClick={handleWhatIfPredict}
                        disabled={loading || simulationLoading}
                        className="btn-outline btn-primary w-full"
                      >
                        {simulationLoading ? t('student.analyzing') : t('student.runSimulation')}
                      </button>
                    </div>
                  </div>

                  {whatIfResult && (
                    <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h5 className="mb-2 text-sm font-semibold text-primary-700 dark:text-gray-300">
                        {t('student.simulationResults')}
                      </h5>
                      <div className="space-y-2">
                        <p className="text-xs text-primary-600 dark:text-gray-400">
                          {t('student.simulationChange', { field: whatIfFeatureLabel, value: whatIfValue })}
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-xs font-mono">
                            {t('student.predictedScore')}: {whatIfResult.final_score?.toFixed(1) ?? '—'}
                          </div>
                          <div className="text-xs font-mono">
                            {t('student.predictedGrade')}: <span className={getGradeBadgeClass(whatIfResult.grade)}>
                              {whatIfResult.grade ?? '—'}
                            </span>
                          </div>
                        </div>
                        {whatIfResult.final_score != null && baselineScore != null && (
                          <div className="mt-1 text-xs text-primary-500 dark:text-gray-400">
                            {t('student.scoreDelta', {
                              value: (whatIfResult.final_score - baselineScore).toFixed(1),
                            })}
                          </div>
                        )}
                      </div>
                    </div>
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

            <form onSubmit={handleSaveProfile} className="space-y-6">
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
                      <span className="text-sm text-primary-700 dark:text-gray-300">
                        {t(`student.${g.toLowerCase()}`)}
                      </span>
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
                  min={15}
                  max={30}
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
                  max={24}
                  step={0.5}
                  value={profile.study_hours_per_day}
                  onChange={(e) => handleChange('study_hours_per_day', parseFloat(e.target.value))}
                  className="w-full accent-primary-600"
                />
                <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600 mt-1">
                  <span>0h</span><span>12h</span><span>24h</span>
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
                  max={24}
                  step={0.5}
                  value={profile.sleep_hours}
                  onChange={(e) => handleChange('sleep_hours', parseFloat(e.target.value))}
                  className="w-full h-6 accent-primary-600"
                />
                <div className="mt-1 flex justify-between text-xs text-primary-300 dark:text-gray-600">
                  <span>0h</span><span>12h</span><span>24h</span>
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
                </select>
              </div>

              {/* Binary toggles */}
              {[
                { key: 'internet_access', label: t('student.internetAccess') },
                { key: 'extracurricular', label: t('student.extracurricular') },
                { key: 'part_time_job', label: t('student.partTimeJob') },
              ].map(({ key, label }) => (
                <fieldset key={key}>
                  <legend className="label">{label}</legend>
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
                        <span className="text-sm text-primary-700 dark:text-gray-300">
                          {t(`student.${v.toLowerCase()}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              <div className="flex gap-3 border-t border-primary-100 pt-2 dark:border-gray-800">
                {user?.role === 'student' && (
                  <button type="submit" disabled={profileSaving} className="btn-primary flex-1">
                    {profileSaving ? t('student.saving') : t('student.saveProfile')}
                  </button>
                )}
                <button type="button" onClick={reset} disabled={profileSaving} className="btn-secondary">
                  {t('common.reset')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}