import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';

export function AdminLayout({ children }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-primary-50 dark:bg-gray-950">
      <aside className="fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-primary-100 dark:border-gray-800 transform transition-transform duration-300 lg:translate-x-0">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-5 border-b border-primary-100 dark:border-gray-800">
            <Link to="/admin" className="flex items-center gap-2.5 font-bold text-primary-950 dark:text-gray-100">
              <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-base">{t('admin.panel')}</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              {t('admin.overview')}
            </Link>
            <Link
              to="/admin/students"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              {t('admin.studentManagement')}
            </Link>
            <Link
              to="/admin/at-risk"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {t('admin.atRiskStudents')}
            </Link>
            <Link
              to="/admin/ai-tools"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548-.548A3.374 3.374 0 0014 14.469V17a1 1 0 01-.553.894l-.491.246a1.5 1.5 0 00-.553 1.679l.216.871a2 2 0 01-1.935 2.41H13.5" />
              </svg>
              {t('admin.aiTools')}
            </Link>
            <Link
              to="/admin/users"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              {t('admin.userManagement')}
            </Link>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-primary-100 dark:border-gray-800">
            <p className="text-xs text-primary-400 dark:text-gray-500 text-center">
              {t('nav.studentPerformance')}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      <div className="lg:hidden fixed inset-0 z-30 bg-black/50 hidden" id="sidebar-overlay" />

      <main className="lg:ml-64 min-h-screen">
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-primary-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-6 py-4">
            <h1 className="text-xl font-bold text-primary-950 dark:text-gray-100">Admin Dashboard</h1>
            <div className="flex items-center gap-4">
              <button
                className="p-2 text-primary-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                onclick={() => document.getElementById('sidebar-overlay')?.classList.toggle('hidden')}
                aria-label="Toggle sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}