import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { SkeletonCard } from '../components/Skeleton';

const DEFAULT_PROFILE = {
  gender: 'Female',
  age: 20,
  study_hours_per_day: 4,
  attendance_percent: 85,
  sleep_hours: 7,
  previous_gpa: 3.2,
  parental_education: 'Masters',
  internet_access: 'Yes',
  extracurricular: 'Yes',
  part_time_job: 'No',
};

const GRADE_COLORS = {
  A: 'bg-green-500 text-white',
  B: 'bg-blue-500 text-white',
  C: 'bg-yellow-500 text-white',
  D: 'bg-orange-500 text-white',
  F: 'bg-red-500 text-white',
};

const SEVERITY_COLORS = {
  success: 'border-green-500 bg-green-50 dark:bg-green-900/30',
  warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30',
  danger: 'border-red-500 bg-red-50 dark:bg-red-900/30',
  info: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
};

export default function Predictor() {
  const { addFlash } = useFlash();
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoPredict, setAutoPredict] = useState(false);
  const debounceRef = useRef(null);

  const handleChange = useCallback((field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handlePredict = useCallback(async (data) => {
    setLoading(true);
    try {
      const response = await api.post('/feedback', data);
      setResult(response);
    } catch (err) {
      addFlash(err.message, 'error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [addFlash]);

  // Debounced auto-predict
  useEffect(() => {
    if (!autoPredict) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handlePredict(profile), 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [profile, autoPredict, handlePredict]);

  const submit = useCallback((e) => {
    e.preventDefault();
    handlePredict(profile);
  }, [handlePredict, profile]);

  const reset = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    setResult(null);
  }, []);

  const grade = result?.grade || '—';
  const score = result?.final_score;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
            AI Academic Counselor
          </h2>
          <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">
            Adjust your study profile below and see how it affects your predicted performance.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoPredict}
            onChange={(e) => setAutoPredict(e.target.checked)}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-primary-600 dark:text-primary-300 dark:text-gray-600">Auto-predict</span>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: Input Form ─────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <h3 className="text-lg font-bold text-primary-950 dark:text-gray-100 mb-5">
              Student Profile
            </h3>

            <form onSubmit={submit} className="space-y-6">
              {/* Gender */}
              <fieldset>
                <legend className="label">Gender</legend>
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
                <label htmlFor="age" className="label">Age</label>
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
                  Study Hours / Day: <strong>{profile.study_hours_per_day}h</strong>
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
                  Attendance: <span className="text-primary-600 dark:text-primary-400">{profile.attendance_percent}%</span>
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
                  Sleep Hours: <span className="text-primary-600 dark:text-primary-400">{profile.sleep_hours}h</span>
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
                <div className="flex justify-between text-xs text-primary-300 dark:text-gray-600 mt-1">
                  <span>0h</span><span>6h</span><span>12h</span>
                </div>
              </div>

              {/* GPA — Slider */}
              <div>
                <label htmlFor="gpa" className="label">
                  Previous GPA: <span className="text-primary-600 dark:text-primary-400">{profile.previous_gpa.toFixed(1)}</span>
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
                <label htmlFor="parental" className="label">Parental Education</label>
                <select
                  id="parental"
                  value={profile.parental_education}
                  onChange={(e) => handleChange('parental_education', e.target.value)}
                  className="input"
                >
                  <option value="High School">High School</option>
                  <option value="Associate">Associate</option>
                  <option value="Bachelors">Bachelors</option>
                  <option value="Masters">Masters</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>

              {/* Binary toggles */}
              {[
                { key: 'internet_access', label: 'Internet Access' },
                { key: 'extracurricular', label: 'Extracurricular' },
                { key: 'part_time_job', label: 'Part-Time Job' },
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
                  {loading ? 'Predicting...' : 'Predict'}
                </button>
                <button type="button" onClick={reset} className="btn-secondary">
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Right: Results Panel ──────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <div className="card p-6 min-h-[500px]">
            {loading ? (
              <div className="space-y-6">
                <SkeletonCard className="h-24" />
                <SkeletonCard className="h-48" />
              </div>
            ) : result ? (
              <div className="space-y-8">
                {/* Grade & Score */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-6 rounded-2xl bg-primary-50/60 dark:bg-gray-800 text-center">
                    <p className="text-xs font-semibold text-primary-400 dark:text-primary-300 dark:text-gray-600 uppercase tracking-wider mb-1">Predicted Final Score</p>
                    <p className="text-4xl font-bold text-primary-950 dark:text-gray-100">
                      {score != null ? score.toFixed(1) : '—'}
                    </p>
                    <p className="text-xs text-primary-400 dark:text-gray-500 mt-1">out of 100</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-primary-50/60 dark:bg-gray-800 text-center">
                    <p className="text-xs font-semibold text-primary-400 dark:text-primary-300 dark:text-gray-600 uppercase tracking-wider mb-1">Predicted Grade</p>
                    <span className={`inline-block mt-1 px-6 py-2 rounded-full text-3xl font-bold ${GRADE_COLORS[grade] || 'bg-gray-400 text-white'}`}>
                      {grade}
                    </span>
                    {result.grade_confidence != null && (
                      <p className="text-xs text-primary-300 dark:text-gray-600 mt-2">
                        {(result.grade_confidence * 100).toFixed(0)}% confidence
                      </p>
                    )}
                  </div>
                </div>

                {/* Grade Probabilities */}
                {result.grade_probabilities && Object.keys(result.grade_probabilities).length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-3">Grade Probability Distribution</h4>
                    <div className="space-y-2">
                      {Object.entries(result.grade_probabilities).map(([g, prob]) => (
                        <div key={g} className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${GRADE_COLORS[g] || 'bg-gray-400 text-white'} flex-shrink-0`}>
                            {g}
                          </span>
                          <div className="flex-1 bg-primary-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${GRADE_COLORS[g] || ''}`}
                              style={{ width: `${(p * 100).toFixed(0)}%`, minWidth: p > 0 ? '1.25rem' : 0 }}
                            />
                          </div>
                          <span className="text-sm font-medium text-primary-600 dark:text-primary-300 dark:text-gray-600 w-12 text-right">
                            {(p * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Feedback & Recommendations */}
                {result.feedback?.recommendations?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-3">
                      Your Personalized Study Recommendations
                    </h4>
                    <div className="space-y-3">
                      {result.feedback.recommendations.map((rec, i) => (
                        <div
                          key={i}
                          className={`flex gap-3 p-4 border-l-4 rounded-r-lg ${SEVERITY_COLORS[rec.severity] || SEVERITY_COLORS.info}`}
                        >
                          <span className="text-2xl flex-shrink-0">{rec.icon}</span>
                          <div>
                            <p className="font-semibold text-primary-950 dark:text-gray-100 text-sm">{rec.title}</p>
                            <p className="text-sm text-primary-600 dark:text-primary-300 dark:text-gray-600 mt-0.5">{rec.text}</p>
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
                <p className="text-primary-400 dark:text-gray-500 font-medium">Adjust your profile and click Predict</p>
                <p className="text-sm text-primary-300 dark:text-gray-600 mt-1">
                  Get AI-powered grade predictions and personalized study advice
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}