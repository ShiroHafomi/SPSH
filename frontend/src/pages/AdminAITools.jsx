import { useState, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import {
  Brain,
  FileText,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Sparkles,
  Eye,
  Edit,
  Trash2,
} from 'lucide-react';

function FeatureCard({ title, description, icon: Icon, actionLabel, onAction, loading, children, className = '' }) {
  return (
    <div className={`rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-clay-sm hover:shadow-clay-md transition-shadow ${className}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-1">{title}</h3>
          <p className="text-primary-500 dark:text-gray-400 text-sm mb-4">{description}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={onAction}
              disabled={loading}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {actionLabel}
            </button>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ title, content, loading, onCopy, copied }) {
  return (
    <div className="rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-clay-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100">{title}</h3>
        <button
          onClick={onCopy}
          disabled={loading || !content}
          className="btn-ghost text-sm flex items-center gap-1.5"
        >
          <Copy className="w-4 h-4" />
          {copied ? 'Copied!' : 'Copy'}
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
        <p className="text-primary-400 dark:text-gray-500 text-center py-8">Click "Generate" to create content</p>
      )}
    </div>
  );
}

export default function AdminAITools() {
  const { flash, addFlash } = useFlash();

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
  const [studentDetails, setStudentDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const handleSummarizeHabits = async () => {
    if (!summarizeStudentId.trim()) {
      addFlash({ type: 'error', message: 'Please enter a Student ID' });
      return;
    }
    setSummarizeLoading(true);
    setSummarizeResult('');
    setSummarizeCopied(false);
    try {
      const data = await api.post(`/admin/students/${summarizeStudentId.trim()}/summarize-habits`);
      setSummarizeResult(data.summary || 'No summary generated');
      addFlash({ type: 'success', message: 'Habit summary generated successfully' });
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: 'Failed to generate habit summary' });
      }
    } finally {
      setSummarizeLoading(false);
    }
  };

  const handleBulkEvaluate = async () => {
    const ids = bulkStudentIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      addFlash({ type: 'error', message: 'Please enter at least one Student ID' });
      return;
    }
    if (ids.length > 50) {
      addFlash({ type: 'error', message: 'Maximum 50 students for bulk evaluation' });
      return;
    }
    setBulkLoading(true);
    setBulkResult('');
    setBulkCopied(false);
    try {
      const data = await api.post('/admin/students/bulk-ai-evaluate', { student_ids: ids });
      setBulkResult(JSON.stringify(data, null, 2));
      addFlash({ type: 'success', message: `Bulk AI evaluation completed for ${data.processed} students` });
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: 'Failed to run bulk AI evaluation' });
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const handleGenerateIntervention = async () => {
    if (!interventionStudentId.trim()) {
      addFlash({ type: 'error', message: 'Please enter a Student ID' });
      return;
    }
    setInterventionLoading(true);
    setInterventionResult('');
    setInterventionCopied(false);
    try {
      const data = await api.post(`/admin/students/${interventionStudentId.trim()}/intervention`);
      setInterventionResult(data.intervention_note || 'No intervention note generated');
      addFlash({ type: 'success', message: 'Intervention note generated successfully' });
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: 'Failed to generate intervention' });
      }
    } finally {
      setInterventionLoading(false);
    }
  };

  const handleFetchStudent = async (id) => {
    if (!id.trim()) return;
    setDetailsLoading(true);
    try {
      const data = await api.get(`/admin/students/${id.trim()}`);
      setStudentDetails(data);
    } catch (err) {
      if (err instanceof ApiError) {
        addFlash({ type: 'error', message: err.message });
      } else {
        addFlash({ type: 'error', message: 'Failed to fetch student details' });
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
      addFlash({ type: 'error', message: 'Failed to copy to clipboard' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100 flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-600" />
            AI Tools
          </h1>
          <p className="text-primary-500 dark:text-gray-400 mt-1">AI-powered academic counseling and student analysis tools</p>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Habit Summarization */}
        <FeatureCard
          title="AI Habit Summarization"
          description="Generate a concise summary of a student's study habits, sleep patterns, attendance, and academic performance from their profile data."
          icon={FileText}
          actionLabel="Generate Summary"
          onAction={handleSummarizeHabits}
          loading={summarizeLoading}
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Enter Student ID (e.g., STU001)"
              value={summarizeStudentId}
              onChange={(e) => setSummarizeStudentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSummarizeHabits()}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>
        </FeatureCard>

        {/* Single Student Intervention */}
        <FeatureCard
          title="Academic Intervention Generator"
          description="Create personalized academic intervention notes tailored to a student's risk factors and performance profile."
          icon={Sparkles}
          actionLabel="Generate Intervention"
          onAction={handleGenerateIntervention}
          loading={interventionLoading}
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Enter Student ID (e.g., STU001)"
              value={interventionStudentId}
              onChange={(e) => setInterventionStudentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateIntervention()}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>
        </FeatureCard>

        {/* Bulk AI Evaluation */}
        <FeatureCard
          title="Bulk AI Evaluation"
          description="Run AI evaluation on multiple students at once. Generates risk assessments, predicted grades, and recommendations for up to 50 students."
          icon={Zap}
          actionLabel="Run Bulk Evaluation"
          onAction={handleBulkEvaluate}
          loading={bulkLoading}
        >
          <textarea
            placeholder="Enter Student IDs (comma-separated)&#10;e.g., STU001, STU002, STU003"
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
          title="Habit Summary"
          content={summarizeResult}
          loading={summarizeLoading}
          onCopy={() => copyToClipboard(summarizeResult, setSummarizeCopied)}
          copied={summarizeCopied}
        />
        <ResultCard
          title="Intervention Note"
          content={interventionResult}
          loading={interventionLoading}
          onCopy={() => copyToClipboard(interventionResult, setInterventionCopied)}
          copied={interventionCopied}
        />
        <ResultCard
          title="Bulk Evaluation Results"
          content={bulkResult}
          loading={bulkLoading}
          onCopy={() => copyToClipboard(bulkResult, setBulkCopied)}
          copied={bulkCopied}
        />
      </div>

      {/* Student Lookup Helper */}
      <div className="rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-clay-sm">
        <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5" />
          Quick Student Lookup
        </h3>
        <p className="text-primary-500 dark:text-gray-400 text-sm mb-4">Look up a student by ID to see their profile before running AI tools</p>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md">
          <input
            type="text"
            placeholder="Enter Student ID to lookup"
            value={studentDetails ? studentDetails.student_id : ''}
            onChange={(e) => {}}
            className="flex-1 px-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-primary-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
          <button
            onClick={() => handleFetchStudent(studentDetails?.student_id || '')}
            disabled={detailsLoading}
            className="btn-secondary flex items-center gap-2 whitespace-nowrap"
          >
            {detailsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Lookup
          </button>
        </div>
        {studentDetails && (
          <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-100 dark:border-primary-800 animate-slide-down">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-primary-500 dark:text-primary-400">Student ID</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">{studentDetails.student_id}</p>
              </div>
              <div>
                <p className="text-primary-500 dark:text-primary-400">Name</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">{studentDetails.name}</p>
              </div>
              <div>
                <p className="text-primary-500 dark:text-primary-400">Grade</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">{studentDetails.grade}</p>
              </div>
              <div>
                <p className="text-primary-500 dark:text-primary-400">Risk Level</p>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  studentDetails.risk_level === 'high' ? 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300' :
                  studentDetails.risk_level === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                  'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300'
                }`}>
                  {studentDetails.risk_level?.charAt(0).toUpperCase() + studentDetails.risk_level?.slice(1) || 'Unknown'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <p className="text-primary-500 dark:text-primary-400">Final Score / GPA</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">
                  {studentDetails.final_score?.toFixed(1) || '—'} / {studentDetails.previous_gpa?.toFixed(2) || '—'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-primary-500 dark:text-primary-400">Attendance / Sleep</p>
                <p className="font-medium text-primary-950 dark:text-gray-100">
                  {studentDetails.attendance_percent?.toFixed(1) || '—'}% / {studentDetails.sleep_hours?.toFixed(1) || '—'} hrs
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage Guidelines */}
      <details className="rounded-2xl border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-clay-sm group">
        <summary className="p-6 cursor-pointer list-none flex items-center gap-3">
          <Zap className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-primary-950 dark:text-gray-100">AI Tools Usage Guidelines</span>
          <span className="ml-auto text-primary-400 dark:text-gray-500 group-open:rotate-180 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>
        <div className="px-6 pb-6 space-y-3 text-sm text-primary-600 dark:text-gray-400">
          <div className="border-l-2 border-violet-200 dark:border-violet-800 pl-4 space-y-2">
            <h4 className="font-medium text-primary-950 dark:text-gray-100">Rate Limits</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Single student AI operations: 30 requests/minute</li>
              <li>Bulk AI evaluation: 5 requests/minute (max 50 students per request)</li>
              <li>Habit summarization: 20 requests/minute</li>
            </ul>
          </div>
          <div className="border-l-2 border-violet-200 dark:border-violet-800 pl-4 space-y-2">
            <h4 className="font-medium text-primary-950 dark:text-gray-100">Data Privacy</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>All AI processing happens on your local ML pipeline</li>
              <li>No student data is sent to external APIs</li>
              <li>Generated notes are stored only in the student's <code className="font-mono bg-primary-100 dark:bg-gray-800 px-1 rounded">notes</code> column</li>
            </ul>
          </div>
          <div className="border-l-2 border-violet-200 dark:border-violet-800 pl-4 space-y-2">
            <h4 className="font-medium text-primary-950 dark:text-gray-100">Best Practices</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Review AI-generated content before sharing with students</li>
              <li>Use habit summaries for parent-teacher conferences</li>
              <li>Intervention notes work best for medium/high risk students</li>
              <li>Bulk evaluation is ideal for end-of-term reviews</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}