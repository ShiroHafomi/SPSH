/**
 * Navbar Component - Modern responsive navigation using new UI components
 */

import { useAuth, homeForRole } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { Link, useLocation } from 'react-router-dom';
import {
  Button,
  Avatar,
  Icon,
  Badge,
  Dropdown,
} from '../components/ui';

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

  // Role badge color variants
  const roleBadgeVariants = {
    admin: 'danger',
    teacher: 'success',
    student: 'primary',
  };

  // Language dropdown items
  const langItems = [
    { key: 'en', label: 'English', flag: '🇺🇸', onClick: () => { if (lang !== 'en') toggleLang(); } },
    { key: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', onClick: () => { if (lang !== 'vi') toggleLang(); } },
  ];

  // User menu dropdown items
  const userMenuItems = [
    { type: 'header', label: t('nav.account') },
    {
      key: 'profile',
      label: t('nav.profile'),
      icon: 'user',
      onClick: () => { /* TODO: profile page */ },
    },
    {
      key: 'settings',
      label: t('nav.settings'),
      icon: 'settings',
      onClick: () => { /* TODO: settings page */ },
    },
    { type: 'divider' },
    ...(isAdmin || user.role === 'teacher' ? [
      {
        key: 'users',
        label: user.role === 'admin' ? t('nav.users') : t('nav.students'),
        icon: 'users',
        onClick: () => {
          user.role === 'admin' ? window.location.href = '/admin/users' : window.location.href = '/teacher/students';
        },
      },
    ] : []),
    { type: 'divider' },
    {
      key: 'logout',
      label: t('nav.logout'),
      icon: 'logOut',
      destructive: true,
      onClick: logout,
    },
  ];

  return (
    <nav className="fixed top-4 left-4 right-4 z-50 max-w-7xl mx-auto bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-primary-100 dark:border-gray-800 rounded-3xl shadow-clay-sm">
      <div className="flex items-center justify-between px-5 py-3">
        <Link to="/dashboard" variant="ghost" className="flex items-center gap-2.5 font-bold text-primary-950 dark:text-gray-100">
          <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
            <Icon name="graduationCap" className="w-4 h-4 text-white" />
          </div>
          <span className="hidden sm:inline text-base">{t('nav.studentPerformance')}</span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                variant={location.pathname === path || location.pathname.startsWith(path + '/') ? 'primary' : 'ghost'}
                size="sm"
                className="px-3.5 py-2 text-sm font-semibold rounded-xl transition-all duration-200"
              >
                {label}
              </Link>
            ))}
          </div>

          {/* User Info + Menu */}
          <Dropdown
            align="right"
            items={userMenuItems}
            trigger={({ isOpen }) => (
              <div className="flex items-center gap-2.5" onClick={() => {}}>
                <Avatar
                  name={user.name}
                  size="default"
                  className="bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300"
                />
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-primary-950 dark:text-gray-100 truncate max-w-[120px]">
                    {user.name}
                  </p>
                  <Badge
                    variant={roleBadgeVariants[user.role] || 'default'}
                    size="xs"
                    className="text-[10px]"
                  >
                    {t(`nav.role.${user.role}`)}
                  </Badge>
                </div>
                <Icon
                  name={isOpen ? 'chevronUp' : 'chevronDown'}
                  className="w-4 h-4 text-primary-500 dark:text-gray-400 hidden sm:block transition-transform duration-200"
                />
              </div>
            )}
          />

          {/* Language Switcher */}
          <Dropdown
            align="right"
            items={langItems}
            trigger={({ isOpen }) => (
              <Button
                variant="ghost"
                size="sm"
                className="w-9 h-9 p-0 rounded-full text-xs font-bold relative"
                aria-label={t('nav.switchLang', { lang: lang === 'en' ? 'Tiếng Việt' : 'English' })}
              >
                <span className="text-base">{langFlag}</span>
                <Icon
                  name={isOpen ? 'chevronUp' : 'chevronDown'}
                  className="w-3 h-3 text-primary-500 dark:text-gray-400 absolute -bottom-1 right-1 opacity-60 hidden"
                />
              </Button>
            )}
          />

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="p-2 rounded-xl"
            onClick={toggleTheme}
            aria-label={isDark ? t('nav.switchToLight') : t('nav.switchToDark')}
            title={isDark ? t('nav.switchToLight') : t('nav.switchToDark')}
          >
            {isDark ? (
              <Icon name="sun" className="w-4 h-4" />
            ) : (
              <Icon name="moon" className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </nav>
  );
}