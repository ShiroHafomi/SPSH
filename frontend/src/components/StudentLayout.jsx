import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';

export function StudentLayout() {
  const { t } = useLanguage();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-gray-950">
      <aside
        id="student-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-primary-100 dark:border-gray-800 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-5 border-b border-primary-100 dark:border-gray-800">
            <Link
              to="/student"
              className="flex items-center gap-2.5 font-bold text-primary-950 dark:text-gray-100"
              onClick={closeSidebar}
            >
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-base">{t('student.myPortal')}</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            <Link
              to="/student"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              {t('student.overview')}
            </Link>
            <Link
              to="/student/simulator"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {t('student.whatIfSimulator')}
            </Link>
            <Link
              to="/student/advisor"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548-.548A3.374 3.374 0 0014 14.469V17a1 1 0 01-.553.894l-.491.246a1.5 1.5 0 00-.553 1.679l.216.871a2 2 0 01-1.935 2.41H13.5" />
              </svg>
              {t('student.aiAdvisor')}
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

      {sidebarOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={closeSidebar}
          aria-label="Close sidebar"
        />
      )}

      <main className="lg:ml-64 min-h-screen">
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-primary-100 dark:border-gray-800">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden p-2 text-primary-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label="Toggle sidebar"
                aria-expanded={sidebarOpen}
                aria-controls="student-sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('student.myPortal')}</h1>
            </div>
            <div aria-hidden="true" className="hidden sm:block w-10" />
          </div>
        </header>
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}