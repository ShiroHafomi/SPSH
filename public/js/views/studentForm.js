/**
 * Student Form View — dynamic form for create/edit.
 * Auto-generates inputs based on schema columns (number, text, date, select, radio, textarea).
 * Handles loading, validation errors, and submit states.
 *
 * @param {HTMLElement} container
 * @param {string|null} studentId - null for create, id string for edit
 */
async function renderStudentForm(container, studentId) {
  const isEdit = !!studentId;

  // ─── Loading State ──────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-pulse" aria-hidden="true">
        <div class="h-6 bg-gray-200 rounded w-48 mb-6"></div>
        ${Array(4).fill(0).map(() => `
          <div class="mb-5">
            <div class="h-4 bg-gray-200 rounded w-24 mb-2"></div>
            <div class="h-10 bg-gray-100 rounded"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  try {
    // ─── Fetch Schema + Existing Student Data ─────────────────────────────
    let student = null;
    let columns = [];

    if (isEdit) {
      const data = await API.get(`/students/${studentId}`);
      student = data.student;
      columns = data.columns;
    } else {
      // For create, just need the columns — fetch the students list to get schema
      const data = await API.get('/students?size=1');
      columns = data.columns;
    }

    if (!columns || !columns.length) {
      throw new Error('No columns found. Import data first.');
    }

    // ─── Render Form ──────────────────────────────────────────────────────
    renderForm();

    // ─── Form Render ──────────────────────────────────────────────────────
    function renderForm(errors = []) {
      container.innerHTML = `
        <div class="max-w-3xl mx-auto">
          <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold text-gray-900">
                ${isEdit ? 'Edit Student' : 'Add New Student'}
              </h2>
              <a href="#/students" class="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                ← Back to list
              </a>
            </div>

            ${errors.length ? `
              <div class="mb-6 p-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg" role="alert">
                <ul class="list-disc list-inside text-sm space-y-1">
                  ${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            <form id="student-form" class="space-y-5" novalidate>
              ${columns.map(col => renderField(col, student)).join('')}

              <div class="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <a href="#/students" class="px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all font-medium text-center cursor-pointer">
                  Cancel
                </a>
                <button
                  id="form-submit"
                  type="submit"
                  class="px-4 py-2.5 text-white font-medium rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${isEdit ? 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500' : 'bg-success-600 hover:bg-success-700 focus:ring-success-500'}"
                >
                  ${isEdit ? 'Save Changes' : 'Create Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      // ─── Bind Submit ────────────────────────────────────────────────────
      const form = document.getElementById('student-form');
      const submitBtn = document.getElementById('form-submit');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {};
        for (const col of columns) {
          const val = formData.get(col.name);
          if (val !== null && val !== '') {
            data[col.name] = val;
          }
        }

        submitBtn.disabled = true;
        submitBtn.textContent = isEdit ? 'Saving...' : 'Creating...';

        try {
          if (isEdit) {
            await API.post(`/students/${studentId}`, data);
          } else {
            await API.post('/students', data);
          }
          showFlash(isEdit ? 'Student updated successfully!' : 'Student created successfully!', 'success');
          Router.navigate('#/students');
        } catch (err) {
          renderForm([err.message]);
        }
      });
    }

  } catch (err) {
    // ─── Error State ──────────────────────────────────────────────────────
    container.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/>
            </svg>
          </div>
          <p class="text-gray-900 font-medium mb-1">Failed to load form</p>
          <p class="text-sm text-gray-500 mb-4">${escapeHtml(err.message)}</p>
          <a href="#/students" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium inline-block">
            ← Back to Students
          </a>
        </div>
      </div>
    `;
  }
}

// ─── Field Renderers ────────────────────────────────────────────────────────

function renderField(col, student) {
  const val = student ? student[col.name] : '';
  const req = !col.nullable ? 'required' : '';
  const optional = col.nullable ? '<p class="text-xs text-gray-500 mt-1">Optional</p>' : '';

  if (col.inferredType === 'boolean') {
    return `
      <div class="grid gap-2">
        <label class="block text-sm font-medium text-gray-700">${escapeHtml(col.displayLabel)}</label>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="${col.name}" value="1" ${val ? 'checked' : ''} class="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500">
            <span class="text-sm text-gray-700">Yes</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="${col.name}" value="0" ${val !== null && !val ? 'checked' : ''} class="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500">
            <span class="text-sm text-gray-700">No</span>
          </label>
        </div>
        ${optional}
      </div>
    `;
  }

  if (col.inferredType === 'category' && col.stats?.distinctCount <= 12 && col.stats?.distinctCount > 1) {
    const uniqueVals = [...new Set(col.stats.sampleValues || [])];
    return `
      <div class="grid gap-2">
        <label for="${col.name}" class="block text-sm font-medium text-gray-700">
          ${escapeHtml(col.displayLabel)} ${col.nullable ? '' : '<span class="text-danger-500 ml-1">*</span>'}
        </label>
        <select name="${col.name}" id="${col.name}" ${req}
          class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all cursor-pointer"
        >
          ${col.nullable ? '<option value="">-- Select --</option>' : ''}
          ${uniqueVals.map(v => `
            <option value="${escapeHtml(String(v))}" ${String(val) === String(v) ? 'selected' : ''}>${escapeHtml(String(v))}</option>
          `).join('')}
        </select>
        ${optional}
      </div>
    `;
  }

  if (col.inferredType === 'date') {
    return `
      <div class="grid gap-2">
        <label for="${col.name}" class="block text-sm font-medium text-gray-700">
          ${escapeHtml(col.displayLabel)} ${col.nullable ? '' : '<span class="text-danger-500 ml-1">*</span>'}
        </label>
        <input
          type="date"
          name="${col.name}"
          id="${col.name}"
          value="${val ? new Date(val).toISOString().split('T')[0] : ''}"
          ${req}
          class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        >
        ${optional}
      </div>
    `;
  }

  if (col.inferredType === 'int' || col.inferredType === 'bigint' || col.inferredType === 'decimal') {
    return `
      <div class="grid gap-2">
        <label for="${col.name}" class="block text-sm font-medium text-gray-700">
          ${escapeHtml(col.displayLabel)} ${col.nullable ? '' : '<span class="text-danger-500 ml-1">*</span>'}
        </label>
        <input
          type="number"
          name="${col.name}"
          id="${col.name}"
          value="${val != null ? val : ''}"
          step="${col.inferredType === 'decimal' ? '0.01' : '1'}"
          ${req}
          class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        >
        ${optional}
      </div>
    `;
  }

  if (col.inferredType === 'text') {
    return `
      <div class="grid gap-2">
        <label for="${col.name}" class="block text-sm font-medium text-gray-700">
          ${escapeHtml(col.displayLabel)} ${col.nullable ? '' : '<span class="text-danger-500 ml-1">*</span>'}
        </label>
        <textarea
          name="${col.name}"
          id="${col.name}"
          rows="3"
          ${req}
          class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        >${escapeHtml(String(val))}</textarea>
        ${optional}
      </div>
    `;
  }

  // Default: text input
  return `
    <div class="grid gap-2">
      <label for="${col.name}" class="block text-sm font-medium text-gray-700">
        ${escapeHtml(col.displayLabel)} ${col.nullable ? '' : '<span class="text-danger-500 ml-1">*</span>'}
      </label>
      <input
        type="text"
        name="${col.name}"
        id="${col.name}"
        value="${escapeHtml(String(val))}"
        ${req}
        class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
      >
      ${optional}
    </div>
  `;
}