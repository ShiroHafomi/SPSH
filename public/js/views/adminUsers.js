/**
 * Admin Users View — table of all users with delete capability.
 * Admin accounts are protected from deletion. Self-deletion is blocked.
 */
async function renderAdminUsers(container) {
  // ─── Loading State ──────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="p-6 border-b border-gray-200">
        <div class="h-6 bg-gray-200 rounded w-40 animate-pulse" aria-hidden="true"></div>
      </div>
      <div class="p-6">
        <div class="space-y-3">
          ${Array(3).fill(0).map(() => `
            <div class="h-14 bg-gray-100 rounded animate-pulse" aria-hidden="true"></div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  try {
    const data = await API.get('/admin/users');
    const { users } = data;
    const currentUserId = _currentUser?.id;

    // ─── Render ───────────────────────────────────────────────────────────
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-warning-100 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-xl font-semibold text-gray-900">Manage Users</h2>
              <p class="text-sm text-gray-500">View and manage user accounts. Admin accounts cannot be deleted.</p>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${users.map(user => `
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-sm text-gray-500">${user.id}</td>
                  <td class="px-4 py-3 text-sm text-gray-900 font-medium">
                    ${escapeHtml(user.name)}
                    ${user.id === currentUserId ? '<span class="text-xs text-gray-400 ml-1">(you)</span>' : ''}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700">${escapeHtml(user.email)}</td>
                  <td class="px-4 py-3 text-sm">
                    ${user.role === 'admin'
                      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800">Admin</span>'
                      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">User</span>'
                    }
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-500">${new Date(user.created_at).toLocaleDateString()}</td>
                  <td class="px-4 py-3 text-right">
                    ${user.role !== 'admin'
                      ? `<button
                           data-id="${user.id}"
                           data-name="${escapeHtml(user.name)}"
                           class="delete-user-btn px-3 py-1.5 text-sm font-medium text-danger-600 bg-danger-50 rounded-lg hover:bg-danger-100 transition-all cursor-pointer ${user.id === currentUserId ? 'opacity-50' : ''}"
                           ${user.id === currentUserId ? 'disabled' : ''}
                         >
                           Delete
                         </button>`
                      : '<span class="text-sm text-gray-400">—</span>'
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="p-4 border-t border-gray-200 text-sm text-gray-600">
          ${users.length} user${users.length !== 1 ? 's' : ''} total
        </div>
      </div>

      <div class="mt-4">
        <a href="#/dashboard" class="text-sm text-primary-600 hover:text-primary-700 transition-colors">← Back to Dashboard</a>
      </div>
    `;

    // ─── Bind Delete Events ───────────────────────────────────────────────
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;

        if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;

        btn.disabled = true;
        btn.textContent = 'Deleting...';

        try {
          await API.post(`/admin/users/${id}/delete`);
          showFlash(`User "${name}" deleted successfully.`, 'success');
          // Re-render the view
          renderAdminUsers(container);
        } catch (err) {
          showFlash(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Delete';
        }
      });
    });

  } catch (err) {
    // ─── Error State ──────────────────────────────────────────────────────
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/>
          </svg>
        </div>
        <p class="text-gray-900 font-medium mb-1">Failed to load users</p>
        <p class="text-sm text-gray-500 mb-4">${escapeHtml(err.message)}</p>
        <button onclick="Router.navigate('#/admin/users')" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium cursor-pointer">
          Retry
        </button>
      </div>
    `;
  }
}