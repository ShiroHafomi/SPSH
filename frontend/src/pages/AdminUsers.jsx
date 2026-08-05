import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonCard } from '../components/Skeleton';

export default function AdminUsers() {
  const { user: currentUser, addFlash } = useAuth();
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
      await api.delete(`/admin/users/${id}/delete`);
      addFlash(`User "${name}" deleted successfully.`, 'success');
      fetchUsers();
    } catch (err) {
      addFlash(err.message, 'error');
    }
    setConfirmDialog({ open: false, id: null, name: '' });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg bg-warning-100" />
          <Skeleton className="h-6 w-40" />
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
        <div className="kpi-icon-box bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary-950 dark:text-gray-100">Manage Users</h2>
          <p className="text-sm text-primary-500 dark:text-gray-400">View and manage user accounts. Admin accounts cannot be deleted.</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-primary-50/60 dark:bg-gray-900 border-b border-primary-100 dark:border-gray-800">
              <tr>
                <th className="table-header-th">ID</th>
                <th className="table-header-th">Name</th>
                <th className="table-header-th">Email</th>
                <th className="table-header-th">Role</th>
                <th className="table-header-th">Created</th>
                <th className="table-header-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-gray-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-primary-400 dark:text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-primary-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-primary-400 dark:text-gray-500">{u.id}</td>
                    <td className="px-4 py-3 text-sm text-primary-950 dark:text-gray-100 font-medium">
                      {u.name}
                      {u.id === currentUser?.id && <span className="text-xs text-primary-300 dark:text-gray-500 ml-1">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-primary-700 dark:text-gray-300">{u.email}</td>
                    <td className="px-4 py-3 text-sm">
                      {u.role === 'admin' ? (
                        <span className="badge badge-warning">Admin</span>
                      ) : (
                        <span className="badge badge-gray">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-primary-400 dark:text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' ? (
                        <button
                          onClick={() => handleDelete(u.id, u.name)}
                          disabled={u.id === currentUser?.id}
                          className={`btn-danger ${u.id === currentUser?.id ? 'opacity-50' : ''}`}
                        >
                          Delete
                        </button>
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

        <div className="p-4 border-t border-primary-100 dark:border-gray-800 text-sm text-primary-500 dark:text-gray-400">
          {users.length} user{users.length !== 1 ? 's' : ''} total
        </div>
      </div>

      <div className="mt-4">
        <Link to="/dashboard" className="text-sm text-primary-600 hover:text-primary-700 transition-colors">
          ← Back to Dashboard
        </Link>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, id: null, name: '' })}
        onConfirm={confirmDelete}
        title="Delete User"
        message={`Are you sure you want to delete user "${confirmDialog.name}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}