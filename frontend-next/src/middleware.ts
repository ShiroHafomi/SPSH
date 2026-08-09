import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { defineRouting } from 'next-intl/routing';

const routing = defineRouting({
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

const PUBLIC_PATHS = ['/login'];
const ADMIN_PATHS = ['/admin'];
const TEACHER_PATHS = ['/teacher'];
const STUDENT_PATHS = ['/student'];
const DASHBOARD_PATHS = ['/dashboard'];

// Create the i18n middleware
const intlMiddleware = createMiddleware(routing);

function getToken(request: NextRequest) {
  return request.cookies.get('access_token')?.value;
}

function getRole(request: NextRequest) {
  return request.cookies.get('user_role')?.value || 'student';
}

// Check if path requires auth (excluding public paths and locale-only paths)
function requiresAuth(pathname: string) {
  // Remove locale prefix like /en/, /vi/
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '');

  if (PUBLIC_PATHS.some(path => pathWithoutLocale.startsWith(path))) {
    return false;
  }
  return true;
}

// Check if user has access to a path based on role
function hasRoleAccess(pathname: string, role: string) {
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '');

  if (ADMIN_PATHS.some(path => pathWithoutLocale.startsWith(path))) {
    return role === 'admin';
  }
  if (TEACHER_PATHS.some(path => pathWithoutLocale.startsWith(path))) {
    return ['admin', 'teacher'].includes(role);
  }
  if (STUDENT_PATHS.some(path => pathWithoutLocale.startsWith(path))) {
    return role === 'student';
  }
  if (DASHBOARD_PATHS.some(path => pathWithoutLocale.startsWith(path))) {
    return true;
  }
  return true;
}

export default function middleware(request: NextRequest) {
  // First run i18n middleware to handle locale
  const intlResponse = intlMiddleware(request);

  // If we're redirecting to a locale, don't check auth yet
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    const location = intlResponse.headers.get('location');
    if (location?.match(/^\/[a-z]{2}\/?$/)) {
      return intlResponse;
    }
  }

  // Check auth for protected routes
  const pathname = request.nextUrl.pathname;
  const token = getToken(request);
  const role = getRole(request);

  if (requiresAuth(pathname)) {
    if (!token) {
      const loginUrl = new URL('/en/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!hasRoleAccess(pathname, role)) {
      return NextResponse.redirect(new URL('/en/dashboard', request.url));
    }
  }

  return intlResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
};