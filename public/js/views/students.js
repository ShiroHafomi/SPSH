/**
 * Students View — searchable, sortable, paginated table with edit/delete.
 * Handles loading, empty, and error states.
 */
async function renderStudents(container) {
  let state = {
    q: '',
    sort: 'id',
    dir: 'asc',
    page: 1,
    size: 20,
    total: 0,
    totalPages: 0,
    columns: [],
    rows: [],
    loading: true,
    error: null,
  };

  // ─── Skeleton Loading ───────────────────────────────────────────────────
  function renderSkeleton() {
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="p-6 border-b border-gray-200">
          <div class="h-8 bg-gray-200 rounded w-32 animate-pulse" aria-hidden="true"></div>
        </div>
        <div class="p-6">
          <div class="h-10 bg-gray-200 rounded w-full mb-4 animate-pulse" aria-hidden="true"></div>
          <div class="space-y-3">
            ${Array(8).fill(0).map(() => `
              <div class="h-12 bg-gray-100 rounded animate-pulse" aria-hidden="true"></div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ─── Render Students ────────────────────────────────────────────────────
  function renderTable() {
    if (state.loading) {
      renderSkeleton();
      return;
    }

    const { rows, columns, q, sort, dir, page, total, totalPages } = state;

    container.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 class="text-xl font-semibold text-gray-900">Students</h2>

          <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <!-- Search -->
            <form id="student-search" class="flex-1 flex gap-2">
              <input
                type="search"
                name="q"
                id="search-input"
                value="${escapeHtml(q)}"
                placeholder="Search students..."
                class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                aria-label="Search students"
              >
              <button type="submit" class="px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all disabled:opacity-60 cursor-pointer">
                Search
              </button>
              ${q ? `<button type="button" id="clear-search" class="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-all cursor-pointer">Clear</button>` : ''}
            </form>

            <a href="#/students/new" class="px-4 py-2.5 bg-success-600 text-white text-sm font-medium rounded-lg hover:bg-success-700 focus:outline-none focus:ring-2 focus:ring-success-500 focus:ring-offset-2 transition-all text-center cursor-pointer">
              + Add Student
            </a>
          </div>
        </div>

        <!-- Error Banner -->
        ${state.error ? `
          <div class="mx-6 mt-4 p-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg flex items-center justify-between" role="alert">
            <span>${escapeHtml(state.error)}</span>
            <button onclick="this.parentElement.remove()" class="text-danger-500 hover:text-danger-700 cursor-pointer" aria-label="Dismiss">&times;</button>
          </div>
        ` : ''}

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                ${columns.map(col => `
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <a href="#" data-sort="${col.name}" class="sort-link hover:text-primary-600 transition-colors ${sort === col.name ? 'text-primary-600' : ''}">
                      <span class="flex items-center gap-1">
                        ${escapeHtml(col.displayLabel)}
                        ${sort === col.name ? `
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}"/>
                          </svg>
                        ` : ''}
                      </span>
                    </a>
                  </th>
                `).join('')}
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${rows.length === 0 ? `
                <tr>
                  <td colspan="${columns.length + 1}" class="px-4 py-16 text-center">
                    <div class="text-gray-400 mb-2">
                      <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
                      </svg>
                    </div>
                    <p class="text-gray-500 font-medium">No students found${q ? ' matching your search' : ''}</p>
                    ${q ? '<p class="text-sm text-gray-400 mt-1">Try different search terms</p>' : '<p class="text-sm text-gray-400 mt-1">Add your first student to get started</p>'}
                  </td>
                </tr>
              ` : rows.map(row => `
                <tr class="hover:bg-gray-50 transition-colors">
                  ${columns.map(col => `
                    <td class="px-4 py-3 text-sm text-gray-900">
                      ${formatCell(row, col)}
                    </td>
                  `).join('')}
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <a href="#/students/${row.id}/edit" class="px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-all cursor-pointer">
                        Edit
                      </a>
                      <button
                        data-id="${row.id}"
                        class="delete-btn px-3 py-1.5 text-sm font-medium text-danger-600 bg-danger-50 rounded-lg hover:bg-danger-100 transition-all cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        ${totalPages > 1 ? `
          <div class="p-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="text-sm text-gray-600">
              Showing page ${page} of ${totalPages} (${total} total)
            </div>
            <nav class="flex items-center gap-2" aria-label="Pagination">
              <button data-page="${page - 1}" class="page-btn px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all ${page <= 1 ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}" ${page <= 1 ? 'disabled' : ''}>
                Previous
              </button>

              ${generatePageButtons(page, totalPages).map(p => {
                if (p === '...') return `<span class="px-2 text-gray-400">…</span>`;
                return `
                  <button data-page="${p}" class="page-btn px-3 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${p === page ? 'bg-primary-600 text-white' : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'}">
                    ${p}
                  </button>
                `;
              }).join('')}

              <button data-page="${page + 1}" class="page-btn px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all ${page >= totalPages ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}" ${page >= totalPages ? 'disabled' : ''}>
                Next
              </button>
            </nav>
          </div>
        ` : `
          <div class="p-4 border-t border-gray-200 text-sm text-gray-600">
            ${total} student${total !== 1 ? 's' : ''} total
          </div>
        `}
      </div>
    `;

    // ─── Bind Events ──────────────────────────────────────────────────────
    bindEvents();
  }

  // ─── Bind UI Events ─────────────────────────────────────────────────────
  function bindEvents() {
    // Search form
    const searchForm = document.getElementById('student-search');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.q = document.getElementById('search-input').value.trim();
        state.page = 1;
        fetchStudents();
      });
    }

    // Clear search
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.q = '';
        state.page = 1;
        fetchStudents();
      });
    }

    // Sort links
    document.querySelectorAll('.sort-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const col = link.dataset.sort;
        if (state.sort === col) {
          state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort = col;
          state.dir = 'asc';
        }
        state.page = 1;
        fetchStudents();
      });
    });

    // Pagination
    document.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page, 10);
        if (p >= 1 && p <= state.totalPages) {
          state.page = p;
          fetchStudents();
        }
      });
    });

    // Delete buttons (delegated for safety)
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Delete this student? This cannot be undone.')) return;

        btn.disabled = true;
        btn.textContent = 'Deleting...';

        try {
          await API.post(`/students/${id}/delete`);
          fetchStudents();
        } catch (err) {
          showFlash(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Delete';
        }
      });
    });
  }

  // ─── Fetch Data ─────────────────────────────────────────────────────────
  async function fetchStudents() {
    state.loading = true;
    state.error = null;
    renderSkeleton();

    try {
      const params = new URLSearchParams({
        q: state.q,
        sort: state.sort,
        dir: state.dir,
        page: state.page,
        size: state.size,
      });

      const data = await API.get(`/students?${params}`);
      state.rows = data.rows;
      state.columns = data.columns;
      state.total = data.total;
      state.totalPages = data.totalPages;
      state.loading = false;
      renderTable();
    } catch (err) {
      state.loading = false;
      state.error = err.message;
      renderTable();
    }
  }

  // ─── Initial Load ───────────────────────────────────────────────────────
  await fetchStudents();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a table cell value based on column type.
 */
function formatCell(row, col) {
  const val = row[col.name];
  if (val === null || val === undefined) {
    return '<span class="text-gray-300 italic">—</span>';
  }
  if (col.inferredType === 'boolean') {
    return val
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">Yes</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">No</span>';
  }
  if (col.inferredType === 'date' || col.inferredType === 'datetime') {
    return new Date(val).toLocaleDateString();
  }
  return escapeHtml(String(val));
}

/**
 * Generate pagination button numbers with ellipsis.
 */
function generatePageButtons(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return pages;
}