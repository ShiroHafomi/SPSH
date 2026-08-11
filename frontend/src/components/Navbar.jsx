import { useAuth, homeForRole } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useLanguage, LANG_FLAGS } from '../hooks/useLanguage';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { lang, toggleLang, langFlag } = useLanguage();
  const { t } = useLanguage();
  const location = useLocation();

  if (!user) return null;

  // Role-based navigation links
  const getNavLinks = () => {
    switch (user.role) {
      case 'admin':
        return [
          { path: '/admin', label: t('nav.adminDashboard') },
          { path: '/teacher', label: t('nav.teacherDashboard') },
          { path: '/students', label: t('nav.students') },
          { path: '/predictor', label: t('nav.aiCounselor') },
        ];
      case 'teacher':
        return [
          { path: '/teacher', label: t('nav.teacherDashboard') },
          { path: '/students', label: t('nav.students') },
          { path: '/predictor', label: t('nav.aiCounselor') },
        ];
      case 'student':
        return [
          { path: '/student', label: t('nav.myPortal') },
        ];
      default:
        return [];
    }
  };

  const navLinks = getNavLinks();

  // Determine role badge color
  const roleBadgeColors = {
    admin: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
    teacher: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    student: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <nav className="fixed top-4 left-4 right-4 z-50 max-w-7xl mx-auto bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-primary-100 dark:border-gray-800 rounded-3xl shadow-clay-sm">
      <div className="flex items-center justify-between px-5 py-3">
        <Link to="/dashboard" className="flex items-center gap-2.5 font-bold text-primary-950 dark:text-gray-100">
          <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="hidden sm:inline text-base">{t('nav.studentPerformance')}</span>
        </Link>

        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                  location.pathname === path || location.pathname.startsWith(path + '/')
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                    : 'text-primary-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-700 dark:hover:text-gray-200'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-gray-400">
              <span className={`w-2 h-2 rounded-full ${user.role === 'admin' ? 'bg-danger-500' : user.role === 'teacher' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
              {user.name}
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${roleBadgeColors[user.role] || 'bg-gray-100 text-gray-700'}`}>
                {t(`nav.role.${user.role}`)}
              </span>
            </span>

            {(user.role === 'admin' || user.role === 'teacher') && (
              <Link
                to={user.role === 'admin' ? '/admin/users' : '/teacher/students'}
                className="hidden sm:inline-flex btn-ghost text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                {user.role === 'admin' ? t('nav.users') : t('nav.students')}
              </Link>
            )}

            {/* Language Switcher */}
            <button
              onClick={toggleLang}
              className="w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold text-primary-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
              title={t('nav.switchLang', { lang: lang === 'en' ? 'Tiếng Việt' : 'English' })}
              aria-label={t('nav.switchLang', { lang: lang === 'en' ? 'Tiếng Việt' : 'English' })}
            >
              {langFlag}
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 text-primary-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
              title={isDark ? t('nav.switchToLight') : t('nav.switchToDark')}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <button
              onClick={logout}
              className="btn-ghost text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}