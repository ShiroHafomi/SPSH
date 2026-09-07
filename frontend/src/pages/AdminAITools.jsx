import { useState } from 'react';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import {
  formatAdminMetric,
  getStudentFromDetailsResponse,
  isPositiveIntegerId,
} from '../utils/adminAiTools.js';
import {
  Brain,
  FileText,
  Zap,
  Loader2,
  Copy,
  Sparkles,
  Eye,
} from 'lucide-react';

function FeatureCard({ title, description, icon: Icon, actionLabel, onAction, loading, children, className = '' }) {
  return (
    <div className={`card-clay p-6 hover:shadow-clay-md ${className}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-1">{title}</h3>
          <p className="text-primary-500 dark:text-gray-400 text-sm mb-4">{description}</p>
          <div className="flex flex-col gap-3">
            {children}
            <button
              type="button"
              onClick={onAction}
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ title, content, loading, onCopy, copied, t }) {
  return (
    <div className="card-clay p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100">{title}</h3>
        <button
          type="button"
          onClick={onCopy}
          disabled={loading || !content}
          className="btn-ghost text-sm flex items-center gap-1.5"
        >
          <Copy className="w-4 h-4" />
          {copied ? t('admin.copied') : t('admin.copy')}
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : content ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-mono text-sm bg-primary-50 dark:bg-gray-900 p-4 rounded-xl border border-primary-100 dark:border-gray-800">
            {content}
          </pre>
        </div>
      ) : (
        <p className="text-primary-400 dark:text-gray-500 text-center py-8">{t('admin.generateToCreate')}</p>
      )}
    </div>
  );
}

export default function AdminAITools() {
  const { addFlash } = useFlash();
  const { t } = useLanguage();

  // Habit Summarization
  const [summarizeStudentId, setSummarizeStudentId] = useState('');
  const [summarizeLoading, setSummarizeLoading] = useState(false);
  const [summarizeResult, setSummarizeResult] = useState('');
  const [summarizeCopied, setSummarizeCopied] = useState(false);

  // Bulk AI Evaluation
  const [bulkStudentIds, setBulkStudentIds] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState('');
  const [bulkCopied, setBulkCopied] = useState(false);

  // Single Student Intervention
  const [interventionStudentId, setInterventionStudentId] = useState('');
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [interventionResult, setInterventionResult] = useState('');
  const [interventionCopied, setInterventionCopied] = useState(false);

  // Student Details for context
  const [lookupStudentId, setLookupStudentId] = useState('');
  const [studentDetails, setStudentDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const handleSummarizeHabits = async () => {
    if (summarizeLoading) return;
    if (!isPositiveIntegerId(summarizeStudentId)) {
      addFlash({ type: 'error', message: t('admin.invalidStudentId') });
      return;
    }
    setSummarizeLoading(true);
    setSummarizeResult('');
    setSummarizeCopied(false);
    try {
      const data = await api.post(`/admin/students/${summarizeStudentId.trim()}/summarize-habits`);
      setSummarizeResult(data.summary || t('admin.noSummaryGenerated'));
      addFlash({ type: 'success', message: t('admin.summaryGenerated') });
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.summaryFailed') });
      }
    } finally {
      setSummarizeLoading(false);
    }
  };

  const handleBulkEvaluate = async () => {
    if (bulkLoading) return;
    const ids = bulkStudentIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      addFlash({ type: 'error', message: t('admin.enterAtLeastOne') });
      return;
    }
    if (ids.some((id) => !isPositiveIntegerId(id))) {
      addFlash({ type: 'error', message: t('admin.invalidStudentIds') });
      return;
    }
    if (ids.length > 50) {
      addFlash({ type: 'error', message: t('admin.maxStudents') });
      return;
    }
    setBulkLoading(true);
    setBulkResult('');
    setBulkCopied(false);
    try {
      const data = await api.post('/admin/students/bulk-ai-evaluate', { ids });
      setBulkResult(JSON.stringify(data, null, 2));
      addFlash({ type: 'success', message: t('admin.aiEvalCompleted', { count: data.processed }) });
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.bulkEvalFailed') });
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const handleGenerateIntervention = async () => {
    if (interventionLoading) return;
    if (!isPositiveIntegerId(interventionStudentId)) {
      addFlash({ type: 'error', message: t('admin.invalidStudentId') });
      return;
    }
    setInterventionLoading(true);
    setInterventionResult('');
    setInterventionCopied(false);
    try {
      const data = await api.post(`/admin/students/${interventionStudentId.trim()}/intervention`);
      setInterventionResult(data.intervention_note || t('admin.noInterventionGenerated'));
      addFlash({ type: 'success', message: t('admin.interventionGenerated') });
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.interventionFailed') });
      }
    } finally {
      setInterventionLoading(false);
    }
  };

  const handleFetchStudent = async (event) => {
    event?.preventDefault();
    if (detailsLoading) return;
    const id = lookupStudentId.trim();
    if (!isPositiveIntegerId(id)) {
      addFlash({ type: 'error', message: t('admin.invalidStudentId') });
      return;
    }

    setDetailsLoading(true);
    setStudentDetails(null);
    try {
      const data = await api.get(`/students/${id}`);
      const student = getStudentFromDetailsResponse(data);
      if (!student) throw new Error('Invalid student details response');
      setStudentDetails(student);
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: t('admin.fetchFailed') });
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const copyToClipboard = async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addFlash({ type: 'error', message: t('admin.clipboardFailed') });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100 flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-600" />
            {t('admin.aiTools')}
          </h1>
          <p className="text-primary-500 dark:text-gray-400 mt-1">{t('admin.aiToolsDesc')}</p>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Habit Summarization */}
        <FeatureCard
          title={t('admin.aiHabitSummary')}
          description={t('admin.aiHabitSummaryDesc')}
          icon={FileText}
          actionLabel={t('admin.generateSummary')}
          onAction={handleSummarizeHabits}
          loading={summarizeLoading}
        >
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder={t('admin.studentIdPlaceholder')}
              aria-label={t('admin.studentIdLabel')}
              value={summarizeStudentId}
              onChange={(e) => setSummarizeStudentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSummarizeHabits()}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>
        </FeatureCard>

        {/* Single Student Intervention */}
        <FeatureCard
          title={t('admin.academicIntervention')}
          description={t('admin.academicInterventionDesc')}
          icon={Sparkles}
          actionLabel={t('admin.generateIntervention')}
          onAction={handleGenerateIntervention}
          loading={interventionLoading}
        >
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder={t('admin.studentIdPlaceholder')}
              aria-label={t('admin.studentIdLabel')}
              value={interventionStudentId}
              onChange={(e) => setInterventionStudentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateIntervention()}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>
        </FeatureCard>

        {/* Bulk AI Evaluation */}
        <FeatureCard
          title={t('admin.bulkAiEval')}
          description={t('admin.bulkAiEvalDesc')}
          icon={Zap}
          actionLabel={t('admin.runBulkEval')}
          onAction={handleBulkEvaluate}
          loading={bulkLoading}
        >
          <textarea
            placeholder={t('admin.enterStudentIds')}
            aria-label={t('admin.studentIdsLabel')}
            value={bulkStudentIds}
            onChange={(e) => setBulkStudentIds(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-y font-mono"
          />
        </FeatureCard>
      </div>

      {/* Results Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ResultCard
          title={t('admin.habitSummary')}
          content={summarizeResult}
          loading={summarizeLoading}
          onCopy={() => copyToClipboard(summarizeResult, setSummarizeCopied)}
          copied={summarizeCopied}
          t={t}
        />
        <ResultCard
          title={t('admin.interventionNoteTitle')}
          content={interventionResult}
          loading={interventionLoading}
          onCopy={() => copyToClipboard(interventionResult, setInterventionCopied)}
          copied={interventionCopied}
          t={t}
        />
        <ResultCard
          title={t('admin.bulkEvalResults')}
          content={bulkResult}
          loading={bulkLoading}
          onCopy={() => copyToClipboard(bulkResult, setBulkCopied)}
          copied={bulkCopied}
          t={t}
        />
      </div>

      {/* Student Lookup Helper */}
      <div className="card-clay p-6">
        <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5" />
          {t('admin.quickLookup')}
        </h3>
        <p className="text-primary-500 dark:text-gray-400 text-sm mb-4">{t('admin.quickLookupDesc')}</p>
        <form onSubmit={handleFetchStudent} className="max-w-md">
          <label htmlFor="admin-student-lookup" className="label">
            {t('admin.studentIdLabel')}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="admin-student-lookup"
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder={t('admin.studentIdPlaceholder')}
              value={lookupStudentId}
              onChange={(event) => setLookupStudentId(event.target.value)}
              className="flex-1 rounded-xl border border-primary-100 bg-white px-4 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800"
            />
            <button
              type="submit"
              disabled={detailsLoading}
              className="btn-secondary flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {detailsLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t('admin.lookup')}
            </button>
          </div>
        </form>
        {studentDetails && (
          <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-100 dark:border-primary-800 animate-slide-down">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-primary-500 dark:text-primary-400">{t('admin.studentLookupId')}</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">
                  {studentDetails.student_id ?? studentDetails.id ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-primary-500 dark:text-primary-400">{t('admin.name')}</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">{studentDetails.name || '—'}</p>
              </div>
              <div>
                <p className="text-primary-500 dark:text-primary-400">{t('common.grade')}</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">{studentDetails.grade || '—'}</p>
              </div>
              <div>
                <p className="text-primary-500 dark:text-primary-400">{t('admin.riskLevel')}</p>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  studentDetails.risk_level === 'high' ? 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300' :
                  studentDetails.risk_level === 'medium' ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300' :
                  studentDetails.risk_level === 'low' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300' :
                  'bg-surface-muted text-ink-muted'
                }`}>
                  {['high', 'medium', 'low'].includes(studentDetails.risk_level)
                    ? t(`admin.${studentDetails.risk_level}Risk`)
                    : t('admin.unknown')}
                </span>
              </div>
              <div className="sm:col-span-2">
                <p className="text-primary-500 dark:text-primary-400">{t('admin.finalScoreGPA')}</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">
                  {formatAdminMetric(studentDetails.final_score, 1)} / {formatAdminMetric(studentDetails.previous_gpa, 2)}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-primary-500 dark:text-primary-400">{t('admin.attendanceSleep')}</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">
                  {formatAdminMetric(studentDetails.attendance_percent, 1, '%')} / {formatAdminMetric(studentDetails.sleep_hours, 1, ` ${t('admin.hoursShort')}`)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage Guidelines */}
      <details className="card-clay group">
        <summary className="p-6 cursor-pointer list-none flex items-center gap-3">
          <Zap className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-primary-950 dark:text-gray-100">{t('admin.aiGuidelines')}</span>
          <span className="ml-auto text-primary-400 dark:text-gray-500 group-open:rotate-180 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>
        <div className="space-y-4 px-6 pb-6 text-sm text-primary-600 dark:text-gray-400">
          <div className="space-y-2 border-l-2 border-violet-200 pl-4 dark:border-violet-800">
            <h4 className="font-medium text-primary-950 dark:text-gray-100">{t('admin.dataHandling')}</h4>
            <ul className="list-inside list-disc space-y-1">
              <li>{t('admin.guidelineAuthorizedRecords')}</li>
              <li>{t('admin.guidelineApprovedSystems')}</li>
            </ul>
          </div>
          <div className="space-y-2 border-l-2 border-violet-200 pl-4 dark:border-violet-800">
            <h4 className="font-medium text-primary-950 dark:text-gray-100">{t('admin.bestPractices')}</h4>
            <ul className="list-inside list-disc space-y-1">
              <li>{t('admin.guidelineDecisionSupport')}</li>
              <li>{t('admin.guidelineReviewOutput')}</li>
              <li>{t('admin.guidelineVerifyStudent')}</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}