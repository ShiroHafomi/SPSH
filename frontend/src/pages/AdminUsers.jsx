/**
 * Admin Users Page - User management using new UI components
 */

import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import {
  Card,
  Button,
  Badge,
  Link as UILink,
  Icon,
  SkeletonCard,
  ConfirmDialog,
} from '../components/ui';
import { useFlash } from '../components/ui/Toast';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, id: null, name: '' });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/users');
      setUsers(data.users);
    } catch (err) {
      addFlash(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [addFlash]);

  const handleDelete = (id, name) => {
    if (id === currentUser?.id) return;
    setConfirmDialog({ open: true, id, name });
  };

  const confirmDelete = async () => {
    const { id, name } = confirmDialog;
    try {
      await api.post(`/admin/users/${id}/delete`);
      addFlash(t('admin.userDeleted', { name }), 'success');
      fetchUsers();
    } catch (err) {
      addFlash(err.message, 'error');
    }
    setConfirmDialog({ open: false, id: null, name: '' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400 flex items-center justify-center">
          <Icon name="users" className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('admin.manageUsers')}</h2>
          <p className="text-sm text-primary-500 dark:text-gray-400">{t('admin.manageUsersDesc')}</p>
        </div>
      </div>

      {/* Users Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-primary-50/60 dark:bg-gray-900 border-b border-primary-100 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">{t('admin.id')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">{t('admin.name')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">{t('admin.email')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">{t('admin.role')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">{t('admin.created')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-gray-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-primary-400 dark:text-gray-500">
                    {t('admin.noUsersFound')}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-primary-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-primary-400 dark:text-gray-500">{u.id}</td>
                    <td className="px-4 py-3 text-sm text-primary-950 dark:text-gray-100 font-medium">
                      {u.name}
                      {u.id === currentUser?.id && <span className="text-xs text-primary-300 dark:text-gray-500 ml-1">{t('admin.you')}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-primary-700 dark:text-gray-300">{u.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant={u.role === 'admin' ? 'warning' : 'default'} size="sm">
                        {t(`nav.role.${u.role}`}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-primary-400 dark:text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' ? (
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Icon name="trash2" className="w-4 h-4" />}
                          onClick={() => handleDelete(u.id, u.name)}
                          disabled={u.id === currentUser?.id}
                        >
                          {t('common.delete')}
                        </Button>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-primary-100 dark:border-gray-800 text-sm text-primary-500 dark:text-gray-400">
          {t('admin.usersTotal', { count: users.length })}
        </div>
      </Card>

      <div className="mt-4">
        <UILink to="/dashboard" variant="ghost" size="sm">
          {t('common.backToDashboard')}
        </UILink>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, id: null, name: '' })}
        onConfirm={confirmDelete}
        title={t('admin.deleteUser')}
        message={t('admin.deleteUserConfirm', { name: confirmDialog.name })}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </div>
  );
}