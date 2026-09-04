/**
 * Admin Users Page - User management using new UI components
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import {
  Card,
  Button,
  Badge,
  SkeletonCard,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
} from '../components/ui';
import { useFlash } from '../components/ui/Toast';
import { CreateUserModal } from '../components/CreateUserModal';
import {
  ADMIN_USERS_PAGE_SIZE as PAGE_SIZE,
  displayAdminUserText,
  formatAdminUserDate,
  normalizeAdminUsersResponse,
  positiveAdminUserId,
} from '../utils/adminUsers';

const ROLE_VARIANTS = {
  admin: 'warning',
  teacher: 'default',
  student: 'success',
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { lang, t } = useLanguage();
  const { addFlash } = useFlash();
  const requestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, id: null, name: '' });

  const fetchUsers = useCallback(async ({ showLoading = true, requestedPage = 1 } = {}) => {
    const requestId = ++requestRef.current;
    const safePage = positiveAdminUserId(requestedPage) || 1;
    if (showLoading) setLoading(true);
    setLoadError(false);

    try {
      const query = new URLSearchParams({ page: String(safePage), size: String(PAGE_SIZE) });
      const data = await api.get(`/admin/users?${query.toString()}`);
      if (requestId !== requestRef.current) return false;

      const normalized = normalizeAdminUsersResponse(data, safePage, PAGE_SIZE);
      setTotal(normalized.total);
      setTotalPages(normalized.totalPages);
      if (normalized.page !== safePage) {
        setPage(normalized.page);
      } else {
        setUsers(normalized.users);
      }
      return true;
    } catch {
      if (requestId !== requestRef.current) return false;
      setLoadError(true);
      return false;
    } finally {
      if (showLoading && requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers({ requestedPage: page });
    return () => {
      requestRef.current += 1;
    };
  }, [fetchUsers, page]);

  const handleUserCreated = async (createdUser) => {
    const name = typeof createdUser?.name === 'string' ? createdUser.name : t('admin.unknown');
    addFlash(t('admin.userCreated', { name }), 'success');
    if (page === 1) {
      await fetchUsers({ showLoading: false, requestedPage: 1 });
    } else {
      setPage(1);
    }
  };

  const handleDelete = (id, name) => {
    const safeId = positiveAdminUserId(id);
    if (safeId === null || safeId === positiveAdminUserId(currentUser?.id)) return;
    setConfirmDialog({ open: true, id: safeId, name: typeof name === 'string' ? name : t('admin.unknown') });
  };

  const confirmDelete = async () => {
    const { id, name } = confirmDialog;
    if (id === null || deletingUserId !== null) return;

    setDeletingUserId(id);
    try {
      await api.delete(`/admin/users/${id}`);
      addFlash(t('admin.userDeleted', { name }), 'success');
      setConfirmDialog({ open: false, id: null, name: '' });
      if (users.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      } else {
        await fetchUsers({ showLoading: false, requestedPage: page });
      }
    } catch (error) {
      addFlash(error?.message || t('admin.userDeleteFailed'), 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label={t('common.loading')}>
        <div className="flex items-center gap-3">
          <SkeletonCard className="w-10 h-10 rounded-lg bg-warning-100" />
          <SkeletonCard className="h-6 w-40" />
        </div>
        <SkeletonCard className="p-6" />
        <SkeletonCard className="p-6" />
        <SkeletonCard className="p-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.manageUsers')}
        subtitle={t('admin.manageUsersDesc')}
        actions={(
          <Button
            leftIcon="userPlus"
            onClick={() => setCreateModalOpen(true)}
            className="w-full sm:w-auto"
          >
            {t('admin.addUser')}
          </Button>
        )}
      />

      {loadError && (
        <ErrorState
          title={t('common.failedToLoad')}
          description={t('admin.usersLoadFailed')}
          actionLabel={t('common.tryAgain')}
          action={() => fetchUsers({ requestedPage: page })}
        />
      )}

      {!loadError && (
      /* Users Table */
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <caption className="sr-only">{t('admin.manageUsersDesc')}</caption>
            <thead className="border-b border-divider bg-surface-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('admin.id')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('admin.name')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('admin.email')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('admin.role')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('admin.created')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4">
                    <EmptyState
                      icon="users"
                      title={t('admin.noUsersFound')}
                    />
                  </td>
                </tr>
              ) : (
                users.map((userRecord, index) => {
                  const role = Object.hasOwn(ROLE_VARIANTS, userRecord.role) ? userRecord.role : null;
                  const recordId = positiveAdminUserId(userRecord.id);
                  const isCurrentUser = recordId !== null && recordId === positiveAdminUserId(currentUser?.id);
                  const canDelete = recordId !== null && role !== 'admin' && role !== null && !isCurrentUser;

                  return (
                    <tr
                      key={recordId ?? `${displayAdminUserText(userRecord.email)}-${index}`}
                      className="transition-colors hover:bg-surface-muted"
                    >
                      <td className="px-4 py-3 text-sm text-ink-muted">{displayAdminUserText(userRecord.id)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-ink">
                        {displayAdminUserText(userRecord.name)}
                        {isCurrentUser && <span className="ml-1 text-xs font-medium text-ink-muted">{t('admin.you')}</span>}
                      </td>
                      <td className="max-w-xs break-all px-4 py-3 text-sm text-ink-muted">{displayAdminUserText(userRecord.email)}</td>
                      <td className="px-4 py-3 text-sm">
                        <Badge variant={role ? ROLE_VARIANTS[role] : 'gray'} size="sm">
                          {role ? t(`nav.role.${role}`) : t('admin.unknown')}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                        {formatAdminUserDate(userRecord.created_at, lang)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canDelete ? (
                          <Button
                            variant="danger"
                            size="sm"
                            leftIcon="trash"
                            onClick={() => handleDelete(recordId, userRecord.name)}
                            loading={deletingUserId === recordId}
                            disabled={deletingUserId !== null}
                          >
                            {t('common.delete')}
                          </Button>
                        ) : (
                          <span className="text-sm text-ink-muted">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{t('admin.deleteUnavailable')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-divider bg-surface-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted" aria-live="polite">
            {t('admin.usersTotal', { count: total })}
          </p>
          <nav className="flex items-center gap-2" aria-label={t('table.pagination')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page <= 1}
              aria-label={t('table.previousPage')}
            >
              {t('common.previous')}
            </Button>
            <span className="min-w-24 text-center text-sm font-semibold text-ink" aria-current="page">
              {t('table.pageOf', { page, totalPages })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              disabled={page >= totalPages}
              aria-label={t('table.nextPage')}
            >
              {t('common.next')}
            </Button>
          </nav>
        </div>
      </Card>
      )}

      <div>
        <Link
          to="/admin"
          className="focus-ring inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-action transition-colors hover:bg-action-muted"
        >
          {t('common.backToDashboard')}
        </Link>
      </div>

      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleUserCreated}
      />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => {
          if (deletingUserId === null) {
            setConfirmDialog({ open: false, id: null, name: '' });
          }
        }}
        onConfirm={confirmDelete}
        title={t('admin.deleteUser')}
        message={t('admin.deleteUserConfirm', { name: confirmDialog.name })}
        confirmText={t('common.delete')}
        variant="danger"
        loading={deletingUserId !== null}
      />
    </div>
  );
}