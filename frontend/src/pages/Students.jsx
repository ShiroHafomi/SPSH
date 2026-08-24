/**
 * Students Page - Searchable, sortable, paginated table with new UI components
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import { formatLabel, formatColumnLabel } from '../utils/formatLabel';
import {
  Table,
  createColumn,
  Card,
  Button,
  Input,
  Badge,
  ConfirmDialog,
  Icon,
  getIcon,
  SkeletonTableRow,
  Flex,
  Tooltip,
} from '../components/ui';
import { useFlash } from '../components/ui/Toast';

export default function Students() {
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const atRisk = searchParams.get('at_risk') === '1';

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState('id');
  const [dir, setDir] = useState('asc');
  const [search, setSearch] = useState('');

  const [confirmDialog, setConfirmDialog] = useState({ open: false, id: null, name: '' });
  const [aiEvalModal, setAiEvalModal] = useState({ open: false, student: null });
  const [aiEvalResult, setAiEvalResult] = useState(null);
  const [aiEvalLoading, setAiEvalLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        sort,
        dir,
        page,
        size: pageSize,
      });
      if (atRisk) params.set('at_risk', 'true');
      const data = await api.get(`/students?${params}`);
      setRows(data.rows);

      // Add "Name Student" column at the beginning
      const columnsWithName = data.columns.map(col => ({
        ...col,
        displayLabel: formatColumnLabel(col.displayLabel, col.name)
      }));
      if (!columnsWithName.some(c => c.name === 'name')) {
        columnsWithName.unshift({
          name: 'name',
          displayLabel: t('students.nameStudent'),
          inferredType: 'text',
          chartRole: 'label',
          semantic: null,
        });
      }
      setColumns(columnsWithName);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      addFlash(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, sort, dir, page, pageSize, atRisk, addFlash, t]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleSort = (col) => {
    const sortCol = col === 'name' ? 'student_id' : col;
    if (sort === sortCol) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(sortCol);
      setDir('asc');
    }
    setPage(1);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(e.currentTarget.elements.q.value);
    setPage(1);
  };

  const handleDelete = (id, name) => {
    setConfirmDialog({ open: true, id, name });
  };

  const confirmDelete = async () => {
    const { id, name } = confirmDialog;
    try {
      await api.post(`/students/${id}/delete`);
      addFlash(t('students.deleted', { name }), 'success');
      fetchStudents();
    } catch (err) {
      addFlash(err.message, 'error');
    }
    setConfirmDialog({ open: false, id: null, name: '' });
  };

  const handleAiEval = async (student) => {
    setAiEvalModal({ open: true, student });
    setAiEvalResult(null);
    setAiEvalLoading(true);

    try {
      const input = {
        gender: student.gender || 'Female',
        age: student.age || 20,
        study_hours_per_day: student.study_hours_per_day || 4,
        attendance_percent: student.attendance_percent || 85,
        sleep_hours: student.sleep_hours || 7,
        previous_gpa: student.previous_gpa || 3.0,
        parental_education: student.parental_education || 'Bachelors',
        internet_access: student.internet_access || 'Yes',
        extracurricular: student.extracurricular || 'Yes',
        part_time_job: student.part_time_job || 'No',
      };
      const result = await api.post('/feedback', input);
      setAiEvalResult(result);
    } catch (err) {
      addFlash(err.message, 'error');
      setAiEvalModal({ open: false, student: null });
    } finally {
      setAiEvalLoading(false);
    }
  };

  const handleApplyToNotes = async () => {
    if (!aiEvalResult?.feedback?.text || !aiEvalModal.student) return;
    try {
      await api.post(`/students/${aiEvalModal.student.id}`, {
        notes: aiEvalResult.feedback.text,
      });
      addFlash(t('students.aiApplied'), 'success');
      setAiEvalModal({ open: false, student: null });
      setAiEvalResult(null);
      fetchStudents();
    } catch (err) {
      addFlash(err.message, 'error');
    }
  };

  // Transform columns to Table component format
  const tableColumns = useMemo(() => {
    return columns.map((col) => {
      if (col.name === 'name') {
        return createColumn({
          key: 'name',
          header: col.displayLabel,
          sortable: true,
          render: (_, row) => (
            <span className="font-medium text-primary-950 dark:text-gray-100">
              {t('students.studentHash', { id: row.student_id || row.id })}
            </span>
          ),
        });
      }

      // Special rendering for boolean columns
      if (col.inferredType === 'boolean') {
        return createColumn({
          key: col.name,
          header: col.displayLabel,
          sortable: true,
          render: (val) => {
            if (val === null || val === undefined) return <span className="text-gray-300 italic">—</span>;
            return (
              <Badge variant={val ? 'success' : 'default'} size="sm">
                {val ? t('common.yes') : t('common.no')}
              </Badge>
            );
          },
        });
      }

      // Date columns
      if (col.inferredType === 'date' || col.inferredType === 'datetime') {
        return createColumn({
          key: col.name,
          header: col.displayLabel,
          sortable: true,
          render: (val) => {
            if (val === null || val === undefined) return <span className="text-gray-300 italic">—</span>;
            return new Date(val).toLocaleDateString();
          },
        });
      }

      // Default text/number columns
      return createColumn({
        key: col.name,
        header: col.displayLabel,
        sortable: true,
        render: (val) => {
          if (val === null || val === undefined) return <span className="text-gray-300 italic">—</span>;
          return String(val);
        },
      });
    });
  }, [columns, t]);

  // Actions column
  const actionsColumn = createColumn({
    key: 'actions',
    header: t('students.actions'),
    sortable: false,
    align: 'right',
    width: 180,
    render: (_, row) => (
      <Flex gap={2} justify="end" className="whitespace-nowrap">
        <Tooltip content={t('students.aiEvaluate')}>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="brain" className="w-4 h-4" />}
            onClick={() => handleAiEval(row)}
            disabled={aiEvalLoading}
            aria-label={t('students.aiEvaluate')}
          />
        </Tooltip>
        <Link
          to={`/students/${row.id}/edit`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-gray-800"
        >
          <Icon name="edit" className="w-4 h-4" />
          {t('common.edit')}
        </Link>
        <Tooltip content={t('common.delete')}>
          <Button
            variant="danger"
            size="sm"
            icon={<Icon name="trash2" className="w-4 h-4" />}
            onClick={() => handleDelete(row.id, row.student_id || row.id)}
            aria-label={t('common.delete')}
          />
        </Tooltip>
      </Flex>
    ),
  });

  const allColumns = useMemo(() => [...tableColumns, actionsColumn], [tableColumns]);

  const generatePageButtons = useCallback(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  }, [totalPages, page]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Flex direction="col" gap={4} className="sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('students.title')}</h2>
        <Flex gap={3} className="w-full sm:w-auto flex-wrap">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2 min-w-[280px]">
            <Input
              name="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('students.searchPlaceholder')}
              leftIcon="search"
              aria-label={t('students.searchLabel')}
              className="flex-1"
            />
            <Button type="submit" variant="primary" size="sm">
              {t('common.search')}
            </Button>
            {search && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setSearch(''); setPage(1); }}
              >
                {t('common.clear')}
              </Button>
            )}
          </form>
          <Link to="/students/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-success-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-success-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success-500 focus-visible:ring-offset-2">
            <Icon name="plus" className="w-4 h-4" />
            {t('students.addStudent')}
          </Link>
        </Flex>
      </Flex>

      {/* At-Risk Filter Banner */}
      {atRisk && (
        <Card variant="default" className="border-l-4 border-danger-500 bg-danger-50/30 dark:bg-danger-950/20">
          <Flex gap={4} wrap className="items-center justify-between">
            <Flex gap={2} className="flex-1 min-w-[200px]">
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-danger-100 dark:bg-danger-900/40 text-danger-600 dark:text-danger-400 flex items-center justify-center">
                <Icon name="alertTriangle" className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-danger-700 dark:text-danger-300">
                  {t('students.atRiskBanner', { count: total })}
                </p>
              </div>
            </Flex>
            <Link to="/students" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-100 hover:text-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 dark:text-danger-400 dark:hover:bg-danger-950/40 dark:hover:text-danger-300">
              {t('students.clearFilter')}
            </Link>
          </Flex>
        </Card>
      )}

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        <Table
          columns={allColumns}
          data={rows}
          loading={loading}
          emptyMessage={search ? t('students.noResults') : t('students.noStudents')}
          emptyAction={
            !search && (
              <Link to="/students/new" className="inline-flex min-h-11 items-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
                {t('students.addFirst')}
              </Link>
            )
          }
          keyField="id"
          sortColumn={sort === 'student_id' ? 'name' : sort}
          sortDirection={dir}
          onSort={handleSort}
        />

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-primary-100 dark:border-gray-800">
            <Flex direction="col" gap={3} className="sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-primary-500 dark:text-gray-400">
                {t('students.showingPage', { page, totalPages, total })}
              </span>
              <nav className="flex items-center gap-2" aria-label={t('students.paginationLabel')}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  leftIcon={<Icon name="chevronLeft" className="w-4 h-4" />}
                >
                  {t('common.previous')}
                </Button>

                {generatePageButtons().map((p) =>
                  p === '...' ? (
                    <span key="ellipsis" className="px-2 text-primary-300 dark:text-gray-600">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setPage(p)}
                      className="w-10 h-10"
                    >
                      {p}
                    </Button>
                  )
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  rightIcon={<Icon name="chevronRight" className="w-4 h-4" />}
                >
                  {t('common.next')}
                </Button>
              </nav>
            </Flex>
          </div>
        )}

        {totalPages <= 1 && (
          <div className="px-4 py-3 border-t border-primary-100 dark:border-gray-800 text-sm text-primary-500 dark:text-gray-400">
            {t('students.totalCount', { total })}
          </div>
        )}
      </Card>

      {/* AI Eval Modal */}
      {aiEvalModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setAiEvalModal({ open: false, student: null })}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-eval-title"
        >
          <div
            className="card-clay max-w-lg w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-primary-100 dark:border-gray-700">
              <h3 id="ai-eval-title" className="text-lg font-bold text-primary-950 dark:text-gray-100">
                {t('students.aiEvalTitle', { id: aiEvalModal.student?.id })}
              </h3>
              <button
                onClick={() => setAiEvalModal({ open: false, student: null })}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
                aria-label={t('common.close')}
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {aiEvalLoading ? (
                <div className="space-y-3">
                  <div className="h-6 bg-primary-100 dark:bg-gray-700 rounded-xl w-3/4 animate-shimmer" />
                  <div className="h-4 bg-primary-100 dark:bg-gray-700 rounded-xl w-full animate-shimmer" />
                  <div className="h-4 bg-primary-100 dark:bg-gray-700 rounded-xl w-5/6 animate-shimmer" />
                  <div className="h-20 bg-primary-100 dark:bg-gray-700 rounded-xl w-full animate-shimmer" />
                </div>
              ) : aiEvalResult ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-primary-50/60 dark:bg-gray-800 rounded-2xl text-center card-clay">
                      <p className="text-xs font-semibold text-primary-400 dark:text-gray-400 uppercase tracking-wider">
                        {t('students.predictedScore')}
                      </p>
                      <p className="text-3xl font-bold text-primary-950 dark:text-gray-100 mt-1">
                        {aiEvalResult.final_score?.toFixed(1)}
                      </p>
                    </div>
                    <div className="p-4 bg-primary-50/60 dark:bg-gray-800 rounded-2xl text-center card-clay">
                      <p className="text-xs font-semibold text-primary-400 dark:text-gray-400 uppercase tracking-wider">
                        {t('students.predictedGrade')}
                      </p>
                      <Badge
                        size="lg"
                        variant={{
                          A: 'success',
                          B: 'primary',
                          C: 'warning',
                          D: 'danger',
                          F: 'destructive',
                        }[aiEvalResult.grade] || 'default'}
                        className="text-xl font-bold px-6 py-2"
                      >
                        {aiEvalResult.grade}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary-700 dark:text-gray-200 mb-2">
                      {t('students.recommendations')}
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(aiEvalResult.feedback?.recommendations || []).map((rec, i) => (
                        <div
                          key={i}
                          className={`flex gap-2 p-2.5 border-l-3 rounded-r text-sm ${
                            {
                              success: 'border-success-500 bg-success-50 dark:bg-success-900/30',
                              warning: 'border-warning-500 bg-warning-50 dark:bg-warning-900/30',
                              danger: 'border-danger-500 bg-danger-50 dark:bg-danger-900/30',
                              info: 'border-primary-500 bg-primary-50 dark:bg-primary-900/30',
                            }[rec.severity] || 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                          }`}
                        >
                          <span className="flex-shrink-0">
                            <Icon name={rec.icon} className="w-5 h-5" />
                          </span>
                          <span className="text-primary-700 dark:text-gray-300">{rec.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-3 border-t border-primary-100 dark:border-gray-700">
                    <Button variant="primary" fullWidth onClick={handleApplyToNotes}>
                      {t('students.applyToNotes')}
                    </Button>
                    <Button variant="secondary" onClick={() => setAiEvalModal({ open: false, student: null })}>
                      {t('common.close')}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, id: null, name: '' })}
        onConfirm={confirmDelete}
        title={t('students.deleteConfirmTitle')}
        message={t('students.deleteConfirmMessage', { name: confirmDialog.name })}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </div>
  );
}