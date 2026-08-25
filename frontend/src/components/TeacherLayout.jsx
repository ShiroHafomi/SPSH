import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { NotificationBell } from './NotificationBell';

export function TeacherLayout() {
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
        id="teacher-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-primary-100 dark:border-gray-800 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-5 border-b border-primary-100 dark:border-gray-800">
            <Link
              to="/teacher"
              className="flex items-center gap-2.5 font-bold text-primary-950 dark:text-gray-100"
              onClick={closeSidebar}
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
              </div>
              <span className="text-base">{t('teacher.panel')}</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            <Link
              to="/teacher"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              {t('teacher.overview')}
            </Link>
            <Link
              to="/teacher/students"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {t('teacher.studentManagement')}
            </Link>
            <Link
              to="/teacher/at-risk"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {t('teacher.atRiskStudents')}
            </Link>
            <Link
              to="/predictor"
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200"
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {t('nav.aiCounselor')}
            </Link>
            <Link
              to="/teacher/notifications"
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                location.pathname === '/teacher/notifications'
                  ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
                  : 'text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200'
              }`}
              onClick={closeSidebar}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {t('notifications.title')}
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
                aria-controls="teacher-sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('teacher.panel')}</h1>
            </div>
            <NotificationBell />
          </div>
        </header>
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}