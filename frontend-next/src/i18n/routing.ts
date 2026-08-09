import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['en', 'vi'] as const,

  // Used when no locale matches
  defaultLocale: 'en',

  // The prefix for the locale in the URL (e.g. /en/dashboard)
  localePrefix: 'always',

  // Pathnames that should not be localized
  pathnames: {
    '/': '/',
    '/login': '/login',
    '/dashboard': '/dashboard',
    '/admin/analytics': '/admin/analytics',
    '/admin/users': '/admin/users',
    '/admin/at-risk': '/admin/at-risk',
    '/admin/students': '/admin/students',
    '/teacher/analytics': '/teacher/analytics',
    '/teacher/students': '/teacher/students',
    '/teacher/at-risk': '/teacher/at-risk',
    '/teacher/ai-counsel': '/teacher/ai-counsel',
    '/student/profile': '/student/profile',
    '/student/simulator': '/student/simulator',
    '/student/advisor': '/student/advisor',
  },
});