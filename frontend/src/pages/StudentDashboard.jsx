import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { renderIcon } from '../components/IconMap';
import { useFlash } from '../components/FlashProvider';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  GradeBadge,
  Icon,
  Input,
  PageHeader,
  Select,
  SkeletonCard,
  Textarea,
} from '../components/ui';
import { homeForRole, useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import {
  buildSimulationInputs,
  buildStudentProfileForm,
  formatStudentMetric,
  normalizeGrade,
  normalizePercentage,
  normalizeProbabilityEntries,
  scoreDelta,
  scoreTone,
  toFiniteNumber,
} from '../utils/studentDashboard';

const EMPTY_PROFILE_FORM = buildStudentProfileForm();
const EMPTY_SIMULATION_INPUTS = buildSimulationInputs();

const SCORE_TONE_CLASSES = {
  success: 'text-success-700 dark:text-success-300',
  warning: 'text-warning-700 dark:text-warning-300',
  danger: 'text-danger-700 dark:text-danger-300',
  neutral: 'text-ink',
};

const RISK_STYLES = {
  danger: 'border-danger-300 bg-danger-50 text-danger-800 dark:border-danger-900/60 dark:bg-danger-950/30 dark:text-danger-200',
  warning: 'border-warning-300 bg-warning-50 text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200',
  info: 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-200',
};

const RECOMMENDATION_STYLES = {
  positive: 'border-success-200 bg-success-50 text-success-800 dark:border-success-900/50 dark:bg-success-950/30 dark:text-success-200',
  warning: 'border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900/50 dark:bg-warning-950/30 dark:text-warning-200',
  danger: 'border-danger-200 bg-danger-50 text-danger-800 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-200',
  info: 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-900/50 dark:bg-primary-950/30 dark:text-primary-200',
};

const API_ICON_MAP = {
  AlertTriangle: 'AlertTriangle',
  BookOpen: 'BookOpen',
  Moon: 'Moon',
  Briefcase: 'Briefcase',
  TrendingUp: 'TrendingUp',
};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function GradeValue({ grade, size = 'default' }) {
  const normalizedGrade = normalizeGrade(grade);
  return normalizedGrade
    ? <GradeBadge grade={normalizedGrade} size={size} />
    : <Badge variant="gray" size={size === 'lg' ? 'lg' : 'default'}>—</Badge>;
}

function MetricCard({ icon, label, value, supportingText, valueClassName = 'text-ink' }) {
  return (
    <Card padding="sm" className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
          <div className={`mt-3 font-mono text-3xl font-bold tabular-nums ${valueClassName}`}>{value}</div>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-action-muted text-action-strong" aria-hidden="true">
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      {supportingText && <p className="mt-3 text-sm text-ink-muted">{supportingText}</p>}
    </Card>
  );
}

function RangeControl({ id, label, value, min, max, step, currentValue, valueLabel, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
        <output htmlFor={id} className="min-w-20 text-right font-mono text-sm font-bold tabular-nums text-ink">
          {valueLabel}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="focus-ring mt-3 h-11 w-full cursor-pointer accent-primary-600"
      />
      <p className="mt-1 text-sm text-ink-muted">{currentValue}</p>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const profileRequestRef = useRef(0);
  const advisorRequestRef = useRef(0);
  const simulationRequestRef = useRef(0);
  const tabRefs = useRef([]);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [percentiles, setPercentiles] = useState({});
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [simulated, setSimulated] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState(false);
  const [advisorAdvice, setAdvisorAdvice] = useState('');
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [advisorError, setAdvisorError] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [simInputs, setSimInputs] = useState(EMPTY_SIMULATION_INPUTS);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [profileSaving, setProfileSaving] = useState(false);

  const loadAdvisor = useCallback(async () => {
    const requestId = ++advisorRequestRef.current;
    setAdvisorLoading(true);
    setAdvisorError(false);

    try {
      const response = await api.get('/student/me/advisor');
      if (requestId !== advisorRequestRef.current) return;
      setAdvisorAdvice(textValue(response?.advice));
    } catch {
      if (requestId !== advisorRequestRef.current) return;
      setAdvisorAdvice('');
      setAdvisorError(true);
    } finally {
      if (requestId === advisorRequestRef.current) setAdvisorLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    const requestId = ++profileRequestRef.current;
    setLoading(true);
    setProfileError(false);
    setProfileMissing(false);

    try {
      const response = await api.get('/student/me/profile');
      if (requestId !== profileRequestRef.current) return;

      const student = asObject(response?.student);
      if (!student) {
        setProfile(null);
        setProfileMissing(true);
        return;
      }

      simulationRequestRef.current += 1;
      setSimulationLoading(false);
      setProfile(student);
      setPercentiles(asObject(response?.percentiles) || {});
      setRiskAlerts(Array.isArray(response?.riskAlerts) ? response.riskAlerts.filter(asObject) : []);
      setSimInputs(buildSimulationInputs(student));
      setProfileForm(buildStudentProfileForm(student));
      setPrediction(null);
      setSimulated(null);
      setRecommendations([]);
      setSimulationError(false);

      try {
        const predictionResponse = await api.post('/student/me/simulate', {});
        if (requestId !== profileRequestRef.current) return;
        const baseline = asObject(predictionResponse?.current);
        setPrediction(baseline);
        setSimulated(baseline);
      } catch {
        if (requestId === profileRequestRef.current) {
          setPrediction(null);
          setSimulated(null);
          setSimulationError(true);
        }
      }
    } catch (error) {
      if (requestId !== profileRequestRef.current) return;
      setProfile(null);
      if (error?.status === 400 || error?.status === 404) {
        setProfileMissing(true);
      } else {
        setProfileError(true);
      }
      if (error?.status === 403) navigate(homeForRole(user?.role));
    } finally {
      if (requestId === profileRequestRef.current) setLoading(false);
    }
  }, [navigate, user?.role]);

  useEffect(() => {
    loadProfile();
    loadAdvisor();

    return () => {
      profileRequestRef.current += 1;
      advisorRequestRef.current += 1;
      simulationRequestRef.current += 1;
    };
  }, [loadAdvisor, loadProfile]);

  const handleSimulate = async () => {
    const requestId = ++simulationRequestRef.current;
    setSimulationLoading(true);
    setSimulationError(false);

    try {
      const response = await api.post('/student/me/simulate', simInputs);
      if (requestId !== simulationRequestRef.current) return;
      const baseline = asObject(response?.current);
      if (baseline) setPrediction(baseline);
      setSimulated(asObject(response?.simulated));
      setRecommendations(Array.isArray(response?.recommendations) ? response.recommendations.filter(asObject) : []);
    } catch {
      if (requestId !== simulationRequestRef.current) return;
      setSimulationError(true);
      addFlash(t('student.simulationFailed'), 'error');
    } finally {
      if (requestId === simulationRequestRef.current) setSimulationLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSimInputs((current) => ({ ...current, [field]: value }));
  };

  const handleProfileChange = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleSaveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      await api.put('/student/me/profile', profileForm);
      simulationRequestRef.current += 1;
      setSimulationLoading(false);
      setSimulated(null);
      setPrediction(null);
      setRecommendations([]);
      setSimulationError(false);
      await loadProfile();
      addFlash(t('student.profileSaved'), 'success');
    } catch {
      addFlash(t('student.profileSaveFailed'), 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const gradeProbabilityRows = useMemo(
    () => normalizeProbabilityEntries(simulated?.grade_probabilities),
    [simulated]
  );

  const tabs = [
    { id: 'overview', label: t('student.tabOverview'), icon: 'dashboard' },
    { id: 'simulator', label: t('student.tabSimulator'), icon: 'sliders' },
    { id: 'advisor', label: t('student.tabAdvisor'), icon: 'messageSquare' },
    { id: 'editProfile', label: t('student.tabEditProfile'), icon: 'user' },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5" aria-busy="true" aria-label={t('student.loadingProfile')}>
        <SkeletonCard />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorState
          title={t('student.profileLoadFailed')}
          description={t('student.profileLoadFailedDesc')}
          action={loadProfile}
          actionLabel={t('common.tryAgain')}
        />
      </div>
    );
  }

  if (profileMissing || !profile) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState icon="user" title={t('student.noProfile')} description={t('student.noProfileDesc')} />
      </div>
    );
  }

  const currentGrade = normalizeGrade(profile.grade);
  const displayName = textValue(profile.name) || textValue(user?.name) || '—';
  const attendance = normalizePercentage(profile.attendance_percent);
  const attendanceWidth = attendance ?? 0;
  const attendanceTone = attendance === null
    ? 'bg-divider'
    : attendance >= 75
      ? 'bg-success-600'
      : attendance >= 60
        ? 'bg-warning-600'
        : 'bg-danger-600';
  const simulatedScore = toFiniteNumber(simulated?.final_score);
  const baselineScore = toFiniteNumber(prediction?.final_score);
  const delta = scoreDelta(simulatedScore, baselineScore);
  const numberOptions = { maximumFractionDigits: 1 };
  const wholeNumberOptions = { maximumFractionDigits: 0 };
  const hoursLabel = (value) => t('student.hoursValue', {
    value: formatStudentMetric(value, lang, numberOptions),
  });
  const percentLabel = (value) => t('student.percentageValue', {
    value: formatStudentMetric(value, lang, numberOptions),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
      <PageHeader
        title={t('student.dashboardTitle', { name: displayName })}
        subtitle={t('student.dashboardSubtitle')}
        actions={
          <Badge variant="outline" size="lg" className="gap-2">
            <Icon name="award" className="size-4" />
            <span>{t('student.currentGrade', { grade: currentGrade || '—' })}</span>
          </Badge>
        }
      />

      {riskAlerts.length > 0 && (
        <section className="space-y-3" aria-labelledby="student-risk-alerts-title" aria-live="polite">
          <h2 id="student-risk-alerts-title" className="sr-only">{t('student.riskAlerts')}</h2>
          {riskAlerts.map((alert, index) => {
            const type = Object.hasOwn(RISK_STYLES, alert.type) ? alert.type : 'info';
            const iconName = Object.hasOwn(API_ICON_MAP, alert.icon)
              ? API_ICON_MAP[alert.icon]
              : 'AlertTriangle';
            return (
              <article
                key={`${textValue(alert.title)}-${textValue(alert.message)}-${index}`}
                className={`flex items-start gap-3 rounded-xl border p-4 ${RISK_STYLES[type]}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-current/10" aria-hidden="true">
                  {renderIcon(iconName, { className: 'size-5' })}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{textValue(alert.title) || t('student.riskAlertFallback')}</h3>
                  {textValue(alert.message) && <p className="mt-1 break-words text-sm">{textValue(alert.message)}</p>}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <div className="overflow-x-auto border-b border-divider">
        <div className="min-w-max" role="tablist" aria-label={t('student.tabsLabel')}>
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                ref={(element) => { tabRefs.current[index] = element; }}
                key={tab.id}
                id={`student-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`student-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`focus-ring inline-flex min-h-11 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-primary-600 text-action-strong'
                    : 'border-transparent text-ink-muted hover:border-divider hover:text-ink'
                }`}
              >
                <Icon name={tab.icon} className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {activeTab === 'overview' && (
        <section id="student-panel-overview" role="tabpanel" aria-labelledby="student-tab-overview" className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t('student.quickWhatIfStudyHours')}</CardTitle>
                <CardDescription>{t('student.simulatorSubtitle')}</CardDescription>
              </div>
              <span className="flex size-10 items-center justify-center rounded-xl bg-action-muted text-action-strong" aria-hidden="true">
                <Icon name="sliders" className="size-5" />
              </span>
            </CardHeader>
            <RangeControl
              id="quick-study-hours"
              label={t('student.studyHoursPerDay')}
              value={simInputs.study_hours_per_day}
              min={0}
              max={24}
              step={0.5}
              currentValue={t('student.currentValue', { val: hoursLabel(profile.study_hours_per_day) })}
              valueLabel={hoursLabel(simInputs.study_hours_per_day)}
              onChange={(value) => handleInputChange('study_hours_per_day', value)}
            />
            <div className="mt-5 grid gap-4 border-t border-divider pt-5 sm:grid-cols-2">
              <div>
                <p className="text-sm text-ink-muted">{t('student.predictedScore')}</p>
                <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${SCORE_TONE_CLASSES[scoreTone(simulatedScore)]}`}>
                  {formatStudentMetric(simulatedScore, lang, numberOptions)}
                </p>
              </div>
              <div>
                <p className="text-sm text-ink-muted">{t('student.predictedGrade')}</p>
                <div className="mt-2"><GradeValue grade={simulated?.grade} size="lg" /></div>
              </div>
            </div>
            <Button
              fullWidth
              className="mt-5"
              leftIcon="sparkles"
              onClick={handleSimulate}
              loading={simulationLoading}
            >
              {t('student.runQuickSimulation')}
            </Button>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon="barChart"
              label={t('student.finalScore')}
              value={formatStudentMetric(profile.final_score, lang, numberOptions)}
              valueClassName={SCORE_TONE_CLASSES[scoreTone(profile.final_score)]}
              supportingText={t('student.percentile', {
                p: formatStudentMetric(normalizePercentage(percentiles.finalScore), lang, wholeNumberOptions),
              })}
            />
            <MetricCard
              icon="award"
              label={t('student.grade')}
              value={<GradeValue grade={currentGrade} size="lg" />}
              supportingText={t('student.classPercentile', {
                p: formatStudentMetric(normalizePercentage(percentiles.gpa), lang, wholeNumberOptions),
              })}
            />
            <MetricCard
              icon="graduationCap"
              label={t('student.previousGPA')}
              value={formatStudentMetric(profile.previous_gpa, lang, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              supportingText={t('student.percentile', {
                p: formatStudentMetric(normalizePercentage(percentiles.gpa), lang, wholeNumberOptions),
              })}
            />
            <Card padding="sm" className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{t('student.attendance')}</p>
                  <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-ink">{percentLabel(attendance)}</p>
                </div>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-action-muted text-action-strong" aria-hidden="true">
                  <Icon name="calendar" className="size-5" />
                </span>
              </div>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-label={t('student.attendanceProgress', { value: formatStudentMetric(attendance, lang, numberOptions) })}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={attendance ?? undefined}
                aria-valuetext={attendance === null ? '—' : undefined}
              >
                <div
                  className={`h-full rounded-full ${attendanceTone}`}
                  style={{ width: `${attendanceWidth}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                {t('student.percentile', {
                  p: formatStudentMetric(normalizePercentage(percentiles.attendance), lang, wholeNumberOptions),
                })}
              </p>
            </Card>
          </div>
        </section>
      )}

      {activeTab === 'simulator' && (
        <section id="student-panel-simulator" role="tabpanel" aria-labelledby="student-tab-simulator" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t('student.simulatorTitle')}</CardTitle>
                <CardDescription>{t('student.simulatorSubtitle')}</CardDescription>
              </div>
            </CardHeader>
            <div className="space-y-6">
              <RangeControl
                id="sim-study-hours"
                label={t('student.studyHours')}
                value={simInputs.study_hours_per_day}
                min={0}
                max={24}
                step={0.5}
                currentValue={t('student.currentValue', { val: hoursLabel(profile.study_hours_per_day) })}
                valueLabel={hoursLabel(simInputs.study_hours_per_day)}
                onChange={(value) => handleInputChange('study_hours_per_day', value)}
              />
              <RangeControl
                id="sim-sleep-hours"
                label={t('student.sleepHours')}
                value={simInputs.sleep_hours}
                min={0}
                max={24}
                step={0.5}
                currentValue={t('student.currentValue', { val: hoursLabel(profile.sleep_hours) })}
                valueLabel={hoursLabel(simInputs.sleep_hours)}
                onChange={(value) => handleInputChange('sleep_hours', value)}
              />
              <RangeControl
                id="sim-attendance"
                label={t('student.attendancePercent')}
                value={simInputs.attendance_percent}
                min={0}
                max={100}
                step={1}
                currentValue={t('student.currentValue', { val: percentLabel(profile.attendance_percent) })}
                valueLabel={percentLabel(simInputs.attendance_percent)}
                onChange={(value) => handleInputChange('attendance_percent', value)}
              />
              <Button fullWidth leftIcon="sparkles" onClick={handleSimulate} loading={simulationLoading}>
                {t('student.runSimulation')}
              </Button>
            </div>
          </Card>

          <Card aria-live="polite">
            <CardHeader>
              <div>
                <CardTitle>{t('student.simulationResults')}</CardTitle>
                <CardDescription>{t('student.adjustSlidersDesc')}</CardDescription>
              </div>
            </CardHeader>

            {simulationError ? (
              <ErrorState
                title={t('student.simulationFailed')}
                description={t('student.simulationFailedDesc')}
                action={handleSimulate}
                actionLabel={t('common.tryAgain')}
                className="border-0 bg-surface-muted"
              />
            ) : simulated ? (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-surface-muted p-4">
                    <p className="text-sm text-ink-muted">{t('student.predictedScore')}</p>
                    <p className={`mt-1 font-mono text-3xl font-bold tabular-nums ${SCORE_TONE_CLASSES[scoreTone(simulatedScore)]}`}>
                      {formatStudentMetric(simulatedScore, lang, numberOptions)}
                    </p>
                    {delta !== null && (
                      <p className={`mt-1 text-sm font-semibold ${delta >= 0 ? 'text-success-700 dark:text-success-300' : 'text-danger-700 dark:text-danger-300'}`}>
                        {delta > 0 ? '+' : ''}{formatStudentMetric(delta, lang, numberOptions)} {t('student.vsCurrent')}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-surface-muted p-4">
                    <p className="text-sm text-ink-muted">{t('student.predictedGrade')}</p>
                    <div className="mt-3"><GradeValue grade={simulated.grade} size="lg" /></div>
                  </div>
                </div>

                {gradeProbabilityRows.length > 0 && (
                  <section aria-labelledby="grade-probabilities-title">
                    <h3 id="grade-probabilities-title" className="text-sm font-bold text-ink">{t('student.gradeProbabilities')}</h3>
                    <div className="mt-3 space-y-3">
                      {gradeProbabilityRows.map(({ grade, probability }) => {
                        const percentage = probability * 100;
                        return (
                          <div key={grade} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4rem] items-center gap-3">
                            <GradeValue grade={grade} />
                            <div
                              className="h-2 overflow-hidden rounded-full bg-surface-muted"
                              role="progressbar"
                              aria-label={t('student.probabilityLabel', {
                                grade,
                                value: formatStudentMetric(percentage, lang, numberOptions),
                              })}
                              aria-valuemin="0"
                              aria-valuemax="100"
                              aria-valuenow={percentage}
                            >
                              <div className="h-full rounded-full bg-primary-600" style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="text-right font-mono text-sm tabular-nums text-ink">{percentLabel(percentage)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {recommendations.length > 0 && (
                  <section aria-labelledby="student-recommendations-title">
                    <h3 id="student-recommendations-title" className="text-sm font-bold text-ink">{t('student.recommendations')}</h3>
                    <div className="mt-3 space-y-3">
                      {recommendations.map((recommendation, index) => {
                        const type = Object.hasOwn(RECOMMENDATION_STYLES, recommendation.type)
                          ? recommendation.type
                          : 'info';
                        const iconName = Object.hasOwn(API_ICON_MAP, recommendation.icon)
                          ? API_ICON_MAP[recommendation.icon]
                          : 'AlertTriangle';
                        return (
                          <article
                            key={`${textValue(recommendation.title)}-${textValue(recommendation.message)}-${index}`}
                            className={`flex items-start gap-3 rounded-xl border p-3 ${RECOMMENDATION_STYLES[type]}`}
                          >
                            <span className="mt-0.5 shrink-0" aria-hidden="true">{renderIcon(iconName, { className: 'size-5' })}</span>
                            <div className="min-w-0">
                              <h4 className="font-semibold">{textValue(recommendation.title) || t('student.recommendationFallback')}</h4>
                              {textValue(recommendation.message) && <p className="mt-1 break-words text-sm">{textValue(recommendation.message)}</p>}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <EmptyState
                icon="sliders"
                title={t('student.adjustSliders')}
                description={t('student.adjustSlidersDesc')}
                className="border-0 bg-surface-muted"
              />
            )}
          </Card>
        </section>
      )}

      {activeTab === 'advisor' && (
        <section id="student-panel-advisor" role="tabpanel" aria-labelledby="student-tab-advisor">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t('student.aiAdvisor')}</CardTitle>
                <CardDescription>{t('student.advisorDescription')}</CardDescription>
              </div>
              <span className="flex size-10 items-center justify-center rounded-xl bg-action-muted text-action-strong" aria-hidden="true">
                <Icon name="brain" className="size-5" />
              </span>
            </CardHeader>
            {advisorLoading ? (
              <div className="space-y-3" aria-busy="true" aria-label={t('student.loadingAdvice')}>
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            ) : advisorError ? (
              <ErrorState
                title={t('student.advisorLoadFailed')}
                description={t('student.advisorLoadFailedDesc')}
                action={loadAdvisor}
                actionLabel={t('common.tryAgain')}
                className="border-0 bg-surface-muted"
              />
            ) : advisorAdvice ? (
              <p className="whitespace-pre-wrap break-words leading-7 text-ink">{advisorAdvice}</p>
            ) : (
              <EmptyState
                icon="messageSquare"
                title={t('student.advisorEmpty')}
                description={t('student.advisorEmptyDesc')}
                className="border-0 bg-surface-muted"
              />
            )}
          </Card>
        </section>
      )}

      {activeTab === 'editProfile' && (
        <section id="student-panel-editProfile" role="tabpanel" aria-labelledby="student-tab-editProfile">
          <Card className="max-w-3xl">
            <CardHeader divider>
              <div>
                <CardTitle>{t('student.editProfileTitle')}</CardTitle>
                <CardDescription>{t('student.editProfileSubtitle')}</CardDescription>
              </div>
            </CardHeader>
            <form onSubmit={(event) => { event.preventDefault(); handleSaveProfile(); }}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Select
                  id="student-gender"
                  label={t('student.gender')}
                  value={profileForm.gender}
                  onChange={(event) => handleProfileChange('gender', event.target.value)}
                  required
                  options={[
                    { value: '', label: t('common.select') },
                    { value: 'Male', label: t('student.male') },
                    { value: 'Female', label: t('student.female') },
                  ]}
                />
                <Input
                  id="student-age"
                  type="number"
                  min="15"
                  max="30"
                  label={t('student.age')}
                  value={profileForm.age}
                  onChange={(event) => handleProfileChange('age', event.target.value)}
                  required
                />
                <Input id="student-study-hours" type="number" min="0" max="24" step="0.5" label={t('student.studyHoursPerDay')} value={profileForm.study_hours_per_day} onChange={(event) => handleProfileChange('study_hours_per_day', event.target.value)} />
                <Input id="student-attendance" type="number" min="0" max="100" step="1" label={t('student.attendancePercent')} value={profileForm.attendance_percent} onChange={(event) => handleProfileChange('attendance_percent', event.target.value)} />
                <Input id="student-sleep-hours" type="number" min="0" max="24" step="0.5" label={t('student.sleepHours')} value={profileForm.sleep_hours} onChange={(event) => handleProfileChange('sleep_hours', event.target.value)} />
                <Input id="student-previous-gpa" type="number" min="0" max="4" step="0.1" label={t('student.previousGPA')} value={profileForm.previous_gpa} onChange={(event) => handleProfileChange('previous_gpa', event.target.value)} />
                <Select
                  id="student-parental-education"
                  label={t('student.parentalEducation')}
                  value={profileForm.parental_education}
                  onChange={(event) => handleProfileChange('parental_education', event.target.value)}
                  options={[
                    { value: '', label: t('common.select') },
                    { value: 'High School', label: t('student.highSchool') },
                    { value: 'Bachelor', label: t('student.bachelors') },
                    { value: 'Master', label: t('student.masters') },
                    { value: 'PhD', label: t('student.phd') },
                  ]}
                />
                {[
                  ['internet_access', 'internetAccess'],
                  ['extracurricular', 'extracurricular'],
                  ['part_time_job', 'partTimeJob'],
                ].map(([field, labelKey]) => (
                  <Select
                    key={field}
                    id={`student-${field.replaceAll('_', '-')}`}
                    label={t(`student.${labelKey}`)}
                    value={profileForm[field]}
                    onChange={(event) => handleProfileChange(field, event.target.value)}
                    options={[
                      { value: '', label: t('common.select') },
                      { value: 'Yes', label: t('student.yes') },
                      { value: 'No', label: t('student.no') },
                    ]}
                  />
                ))}
              </div>
              <Textarea
                id="student-notes"
                className="mt-5"
                label={t('student.notes')}
                value={profileForm.notes}
                onChange={(event) => handleProfileChange('notes', event.target.value)}
                rows={4}
                placeholder={t('student.notesPlaceholder')}
              />
              <div className="mt-6 flex justify-end border-t border-divider pt-5">
                <Button type="submit" leftIcon="check" loading={profileSaving}>
                  {t('student.saveProfile')}
                </Button>
              </div>
            </form>
          </Card>
        </section>
      )}
    </div>
  );
}