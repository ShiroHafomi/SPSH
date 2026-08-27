import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, Check, RefreshCw, Loader2, Moon, Sun, ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { Button, ConfirmDialog, Dialog, FormInput, FormSelect, FormTextarea, SkeletonCard } from '../components/ui';
import { format, parseISO, startOfWeek, endOfWeek, isSameDay, isSameMonth, isSameYear, compareAsc } from 'date-fns';
import { vi } from '../locales/vi';

export default function StudyPlanner() {
  const { t } = useLanguage();
  const { addFlash } = useFlash();

  // State for sessions
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // State for session form
  const [sessionForm, setSessionForm] = useState({
    open: false,
    session: null,
    isEditMode: false
  });

  // State for confirmations
  const [confirmation, setConfirmation] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // State for view options
  const [view, setView] = useState('week'); // week or list
  const [selectedDate, setSelectedDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday as start of week
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Load sessions for the selected week
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const startDate = format(selectedDate, "yyyy-MM-dd'T'HH:mm:ssxxx");
      const endDate = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ssxxx");

      const response = await api.get('/student/me/study-sessions', {
        startDate,
        endDate
      });

      const sessionsArray = Array.isArray(response.sessions) ? response.sessions : [];
      setSessions(sessionsArray);
    } catch (error) {
      setLoadError(error?.message || t('studyPlanner.loading'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, t]);

  // Load initial sessions
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Recalculate week boundaries when selectedDate changes
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);

  // Filter sessions for the current week
  const weeklySessions = useMemo(() => {
    return sessions.filter(session => {
      const sessionStart = parseISO(session.starts_at);
      return isSameWeek(sessionStart, selectedDate, { weekStartsOn: 1 });
    });
  }, [sessions, selectedDate]);

  // Group sessions by day for week view
  const sessionsByDay = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      days.push({
        date: day,
        name: format(day, 'EEEE'),
        shortName: format(day, 'EEE'),
        dayNum: format(day, 'd'),
        sessions: weeklySessions.filter(session => {
          const sessionStart = parseISO(session.starts_at);
          return isSameDay(sessionStart, day);
        })
      });
    }
    return days;
  }, [weekStart, weeklySessions]);

  // Weekly summary
  const weeklySummary = useMemo(() => {
    const completedSessions = weeklySessions.filter(s => s.status === 'completed');
    const skippedSessions = weeklySessions.filter(s => s.status === 'skipped');
    const plannedSessions = weeklySessions.filter(s => s.status === 'planned');

    const totalScheduledMinutes = weeklySessions.reduce((sum, session) => {
      if (session.status !== 'skipped') {
        const start = parseISO(session.starts_at);
        const end = parseISO(session.ends_at);
        const diffMs = end - start;
        const diffMinutes = Math.round(diffMs / (60 * 1000));
        return sum + diffMinutes;
      }
      return sum;
    }, 0);

    const totalActualMinutes = completedSessions.reduce((sum, session) => {
      return sum + (session.actual_minutes || 0);
    }, 0);

    return {
      totalSessions: weeklySessions.length,
      completedSessions: completedSessions.length,
      skippedSessions: skippedSessions.length,
      plannedSessions: plannedSessions.length,
      totalScheduledMinutes,
      totalActualMinutes
    };
  }, [weeklySessions]);

  // Check if two dates are in the same week
  function isSameWeek(date1, date2, options) {
    const start1 = startOfWeek(date1, options);
    const start2 = startOfWeek(date2, options);
    return isSameDay(start1, start2);
  }

  // Add days to a date
  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  // Format time for display
  function formatTime(dateString) {
    if (!dateString) return '';
    const date = parseISO(dateString);
    return format(date, 'HH:mm');
  }

  // Format date for display
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = parseISO(dateString);
    return format(date, 'MMM d, yyyy');
  }

  // Handle form submission
  const handleSessionSave = async (payload) => {
    try {
      if (sessionForm.session?.id) {
        await api.put(`/student/me/study-sessions/${sessionForm.session.id}`, payload);
        addFlash(t('studyPlanner.updated'), 'success');
      } else {
        await api.post('/student/me/study-sessions', payload);
        addFlash(t('studyPlanner.created'), 'success');
      }
      await loadSessions();
      setSessionForm({ open: false, session: null, isEditMode: false });
    } catch (error) {
      addFlash(error?.message || t('common.tryAgain'), 'error');
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!confirmation) return;
    setDeleting(true);
    try {
      await api.delete(`/student/me/study-sessions/${confirmation.id}`);
      addFlash(t('studyPlanner.deleted'), 'success');
      setConfirmation(null);
      await loadSessions();
    } catch (error) {
      addFlash(error?.message || t('common.tryAgain'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (id, newStatus) => {
    try {
      // Get current session to validate
      const currentSession = sessions.find(s => s.id === id);
      if (!currentSession) return;

      const payload = { status: newStatus };

      // Additional validation for status changes
      if (newStatus === 'completed') {
        // For completion, we need actual minutes
        // In a real implementation, we'd prompt for this
        // For now, we'll use a default value or require it in the UI
        payload.actual_minutes = 60; // Default 1 hour
        payload.completed_at = new Date().toISOString();

        // Check if trying to complete before start time
        const now = new Date();
        const startTime = new Date(currentSession.starts_at);
        if (now < startTime) {
          addFlash(t('studyPlanner.cannotCompleteBeforeStart'), 'error');
          return;
        }
      } else if (newStatus === 'planned' && ['completed', 'skipped'].includes(currentSession.status)) {
        // Reopening clears completion data
        payload.actual_minutes = null;
        payload.completed_at = null;
      }

      await api.patch(`/student/me/study-sessions/${id}/status`, payload);
      const actionMap = {
        completed: t('studyPlanner.completedSession'),
        skipped: t('studyPlanner.skippedSession'),
        planned: t('studyPlanner.reopenedSession')
      };
      addFlash(actionMap[newStatus] || t('common.save'), 'success');
      await loadSessions();
    } catch (error) {
      addFlash(error?.message || t('common.tryAgain'), 'error');
    }
  };

  // Render timezone selector options
  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'America/Phoenix',
    'America/Toronto',
    'America/Vancouver',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland',
    'UTC'
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (loadError && !sessions.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-12">
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-8 text-danger-700 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-300 text-center">
          <p className="font-semibold mb-4">{loadError}</p>
          <Button variant="outline" onClick={loadSessions} className="mt-4">
            {t('common.refresh')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 md:mb-0">
            <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">
              {t('studyPlanner.title')}
            </h1>
            <p className="mt-1 text-primary-600 dark:text-gray-400">
              {t('studyPlanner.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const prev = addDays(weekStart, -7);
                  setSelectedDate(prev);
                }}
                disabled={false}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('studyPlanner.previousWeek')}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDate(startOfWeek(new Date(), { weekStartsOn: 1 }));
                }}
              >
                {t('studyPlanner.today')}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = addDays(weekStart, 7);
                  setSelectedDate(next);
                }}
                disabled={false}
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                {t('studyPlanner.nextWeek')}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView(view === 'week' ? 'list' : 'week')}
              >
                {view === 'week' ? t('studyPlanner.listView') : t('studyPlanner.weekView')}
              </Button>
            </div>

            <Button
              onClick={() => setSessionForm({ open: true, session: null, isEditMode: false })}
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              {t('studyPlanner.createSession')}
            </Button>
          </div>
        </div>

        {/* Week View */}
        {view === 'week' && (
          <>
            {/* Weekly Summary */}
            <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-primary-100 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-primary-950 dark:text-gray-100">
                    {t('studyPlanner.weeklySummary')}
                  </div>
                  <div className="text-sm text-primary-600 dark:text-gray-400">
                    {format(weekStart, 'MMM d, yyyy')} - {format(weekEnd, 'MMM d, yyyy')}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-center">
                  <div>
                    <p className="text-xs text-primary-500 dark:text-gray-400">
                      {t('studyPlanner.scheduledSessions')}
                    </p>
                    <p className="text-2xl font-bold text-primary-950 dark:text-gray-100">
                      {weeklySummary.plannedSessions}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-primary-500 dark:text-gray-400">
                      {t('studyPlanner.completedSessions')}
                    </p>
                    <p className="text-2xl font-bold text-primary-950 dark:text-gray-100">
                      {weeklySummary.completedSessions}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-primary-500 dark:text-gray-400">
                      {t('studyPlanner.skippedSessions')}
                    </p>
                    <p className="text-2xl font-bold text-primary-950 dark:text-gray-100">
                      {weeklySummary.skippedSessions}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-primary-500 dark:text-gray-400">
                      {t('studyPlanner.totalScheduledMinutes')}
                    </p>
                    <p className="text-2xl font-bold text-primary-950 dark:text-gray-100">
                      {weeklySummary.totalScheduledMinutes} {t('studyPlanner.minutes')}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-primary-500 dark:text-gray-400">
                      {t('studyPlanner.totalActualMinutes')}
                    </p>
                    <p className="text-2xl font-bold text-primary-950 dark:text-gray-100">
                      {weeklySummary.totalActualMinutes} {t('studyPlanner.minutes')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="mb-4">
              <div className="grid gap-2 lg:grid-cols-7 text-center">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <div key={index} className={`text-sm font-medium text-primary-600 dark:text-gray-400 ${
                    isSameDay(addDays(weekStart, index), new Date())
                      ? 'text-primary-950 dark:text-gray-100 font-bold'
                      : ''
                  }`}>
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Session Grid */}
            <div className="grid gap-4 lg:grid-cols-7">
              {sessionsByDay.map((day, dayIndex) => (
                <div key={dayIndex} className="col-span-1">
                  <div className="mb-2 text-center">
                    <div className={`text-xs font-semibold ${
                      isSameDay(day.date, new Date())
                        ? 'bg-primary-100 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                        : 'bg-primary-50 text-primary-600 dark:text-gray-400'
                    } px-2 py-1 rounded`}
                    >
                      {day.name}, {format(day.date, 'MMM d')}
                    </div>
                  </div>

                  <div className="space-y-2 min-h-[100px]">
                    {day.sessions.length > 0 ? (
                      day.sessions.map((session) => {
                        const statusClasses = {
                          planned: 'bg-primary-50 text-primary-600 dark:text-gray-400',
                          completed: 'bg-success-50 text-success-600 dark:text-success-400',
                          skipped: 'bg-warning-50 text-warning-600 dark:text-warning-400'
                        };

                        return (
                          <div
                            key={session.id}
                            className={`p-3 rounded-lg border border-primary-100 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer hover:shadow-md transition-shadow ${
                              statusClasses[session.status as keyof typeof statusClasses]
                            }`}
                            onClick={() => setSessionForm({
                              open: true,
                              session: session,
                              isEditMode: true
                            })}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-medium text-primary-950 dark:text-gray-100 truncate w-full">
                                {session.title}
                              </h3>
                              <div className={`text-xs px-2 py-1 rounded-full ${
                                statusClasses[session.status as keyof typeof statusClasses].replace('bg', 'bg').replace('text', 'text')
                              }`}>
                                {t(`studyPlanner.${session.status}`)}
                              </div>
                            </div>

                            {session.subject && (
                              <p className="text-xs text-primary-500 dark:text-gray-400 truncate w-full">
                                {session.subject}
                              </p>
                            )}

                            <div className="text-xs text-primary-500 dark:text-gray-400">
                              {formatTime(session.starts_at)} - {formatTime(session.ends_at)}
                              {session.timezone && ` (${session.timezone})`}
                            </div>

                            <div className="mt-2 flex items-center gap-2 text-xs">
                              {/* Duration */}
                              <span>
                                {Math.round((parseISO(session.ends_at) - parseISO(session.starts_at)) / (60 * 1000))} {t('studyPlanner.minutes')}
                              </span>

                              {session.status === 'completed' && session.actual_minutes !== null && (
                                <>
                                  <span className="mx-2">|</span>
                                  <span className="text-success-600 dark:text-success-400">
                                    {session.actual_minutes} {t('studyPlanner.minutes')}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-primary-400 dark:text-gray-500 text-center italic">
                        {t('common.noData')}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* All-day events row (placeholder for future enhancement) */}
              <div className="col-span-1">
                <div className="text-xs text-primary-400 dark:text-gray-500 text-center italic">
                  {t('studyPlanner.allDay')}
                </div>
              </div>
            </div>
          </>
        )}

        {/* List View */}
        {view === 'list' && (
          <>
            {!sessions.length ? (
              <div className="text-center py-12">
                <p className="text-primary-500 dark:text-gray-400">
                  {t('studyPlanner.noSessions')}
                </p>
                <p className="text-primary-400 dark:text-gray-500 mt-2">
                  {t('studyPlanner.createFirstSession')}
                </p>
                <Button
                  onClick={() => setSessionForm({ open: true, session: null, isEditMode: false })}
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('studyPlanner.createSession')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border border-primary-100 dark:border-gray-700 bg-white dark:bg-gray-800`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h2 className="font-semibold text-primary-950 dark:text-gray-100">
                          {session.title}
                        </h2>

                        {session.subject && (
                          <p className="text-sm text-primary-500 dark:text-gray-400">
                            {session.subject}
                          </p>
                        )}

                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{t('common.date')}:</span>
                            <span>{formatDate(session.starts_at)}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-medium">{t('common.time')}:</span>
                            <span>{formatTime(session.starts_at)} - {formatTime(session.ends_at)}</span>
                            {session.timezone && (
                              <span className="ml-2 text-xs">
                                ({session.timezone})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-medium">{t('studyPlanner.duration')}:</span>
                            <span>
                              {Math.round((parseISO(session.ends_at) - parseISO(session.starts_at)) / (60 * 1000))}
                              {t('studyPlanner.minutes')}
                            </span>
                          </div>
                        </div>

                        {session.status === 'completed' && (
                          <div className="mt-2 space-y-1 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{t('studyPlanner.actualMinutes')}:</span>
                              <span className="text-success-600 dark:text-success-400">
                                {session.actual_minutes || 0} {t('studyPlanner.minutes')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{t('common.completedAt')}:</span>
                              <span>{session.completed_at ? formatDate(session.completed_at) : '-'}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          session.status === 'planned'
                            ? 'bg-primary-50 text-primary-600 dark:text-gray-400'
                            : session.status === 'completed'
                            ? 'bg-success-50 text-success-600 dark:text-success-400'
                            : 'bg-warning-50 text-warning-600 dark:text-warning-400'
                        }`}>
                          {t(`studyPlanner.${session.status}`)}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSessionForm({ open: true, session: session, isEditMode: true })}
                          >
                            {t('common.edit')}
                          </Button>

                          {session.status !== 'completed' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(session.id, 'completed')}
                                disabled={session.status === 'completed'}
                              >
                                {t('studyPlanner.completeSession')}
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(session.id, 'skipped')}
                                disabled={session.status === 'skipped'}
                              >
                                {t('studyPlanner.skipSession')}
                              </Button>
                            </>
                          )}

                          {session.status !== 'planned' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(session.id, 'planned')}
                              disabled={session.status === 'planned'}
                            >
                              {t('studyPlanner.reopenSession')}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmation({ id: session.id, ...session })}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Session Form */}
        <Dialog
          isOpen={sessionForm.open}
          onClose={() => setSessionForm({ open: false, session: null, isEditMode: false })}
          title={
            sessionForm.session && sessionForm.session.id
              ? t('studyPlanner.editSession')
              : t('studyPlanner.createSession')
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const payload = {
                title: formData.get('title'),
                subject: formData.get('subject') || null,
                starts_at: formData.get('starts_at'),
                ends_at: formData.get('ends_at'),
                timezone: formData.get('timezone'),
                status: formData.get('status') || 'planned',
                actual_minutes: formData.get('actual_minutes')
                  ? parseInt(formData.get('actual_minutes'), 10)
                  : null,
                completed_at: formData.get('completed_at')
                  ? formData.get('completed_at')
                  : null
              };

              // Remove empty strings and convert to null where appropriate
              Object.keys(payload).forEach(key => {
                if (payload[key] === '' || payload[key] === undefined) {
                  payload[key] = null;
                } else if (key === 'actual_minutes' && payload[key] === '') {
                  payload[key] = null;
                } else if (key === 'completed_at' && payload[key] === '') {
                  payload[key] = null;
                }
              });

              handleSessionSave(payload);
            }}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormInput
                label={t('studyPlanner.sessionTitle')}
                id="title"
                name="title"
                required
                defaultValue={sessionForm.session?.title || ''}
                onChange={(e) => {}}
              />

              <FormInput
                label={t('studyPlanner.subject')}
                id="subject"
                name="subject"
                defaultValue={sessionForm.session?.subject || ''}
                onChange={(e) => {}}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormInput
                label={t('studyPlanner.date')}
                id="date"
                name="date"
                type="date"
                required
                defaultValue={
                  sessionForm.session?.starts_at
                    ? format(parseISO(sessionForm.session.starts_at), 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd')
                }
                onChange={(e) => {}}
              />

              <FormInput
                label={t('studyPlanner.startTime')}
                id="starts_at"
                name="starts_at"
                type="time"
                required
                defaultValue={
                  sessionForm.session?.starts_at
                    ? format(parseISO(sessionForm.session.starts_at), 'HH:mm')
                    : format(new Date(), 'HH:mm')
                }
                onChange={(e) => {}}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormInput
                label={t('studyPlanner.endTime')}
                id="ends_at"
                name="ends_at"
                type="time"
                required
                defaultValue={
                  sessionForm.session?.ends_at
                    ? format(parseISO(sessionForm.session.ends_at), 'HH:mm')
                    : format(addHours(new Date(), 1), 'HH:mm')
                }
                onChange={(e) => {}}
              />

              <FormSelect
                label={t('studyPlanner.timezone')}
                id="timezone"
                name="timezone"
                required
                defaultValue={sessionForm.session?.timezone || timezone}
                onChange={(e) => {}}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </FormSelect>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormSelect
                  label={t('studyPlanner.status')}
                  id="status"
                  name="status"
                  required
                  defaultValue={sessionForm.session?.status || 'planned'}
                  onChange={(e) => {}}
                >
                  <option value="planned">{t('studyPlanner.planned')}</option>
                  <option value="completed">{t('studyPlanner.completed')}</option>
                  <option value="skipped">{t('studyPlanner.skipped')}</option>
                </FormSelect>

                <div id="actual-minutes-field">
                  <FormInput
                    label={t('studyPlanner.actualMinutes')}
                    id="actual_minutes"
                    name="actual_minutes"
                    type="number"
                    min="1"
                    max="720"
                    defaultValue={
                      sessionForm.session?.actual_minutes !== null && sessionForm.session?.actual_minutes !== undefined
                        ? sessionForm.session?.actual_minutes
                        : ''
                    }
                    onChange={(e) => {}}
                  />

                  <p className="text-xs text-primary-500 dark:text-gray-400 mt-1">
                    {t('studyPlanner.actualMinutesHelp')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-primary-200 dark:border-gray-700">
              <Button
                type="button"
                onClick={() => setSessionForm({ open: false, session: null, isEditMode: false })}
                variant="outline"
              >
                {t('common.cancel')}
              </Button>

              <Button
                type="submit"
                isLoading={false}
              >
                {sessionForm.session?.id ? t('common.save') : t('common.create')}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={Boolean(confirmation)}
          onClose={() => !deleting && setConfirmation(null)}
          onConfirm={handleDeleteConfirm}
          title={t('studyPlanner.confirmDelete')}
          message={t('studyPlanner.confirmDeleteDescription')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          loading={deleting}
        />
      </div>
    </div>
  );
}

// Helper function to add hours to a date
function addHours(date, hours) {
  const result = new Date(date);
  result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  return result;
}