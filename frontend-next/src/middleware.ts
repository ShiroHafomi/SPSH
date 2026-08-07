import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const PUBLIC_PATHS = ['/login'];
const ADMIN_PATHS = ['/admin'];
const TEACHER_PATHS = ['/teacher'];
const STUDENT_PATHS = ['/student'];
const DASHBOARD_PATHS = ['/dashboard'];

function getToken(request: NextRequest) {
  return request.cookies.get('access_token')?.value;
}

function getRole(request: NextRequest) {
  return request.cookies.get('user_role')?.value || 'student';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = getToken(request);
  const role = getRole(request);

  // Allow public paths
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Redirect to login if no token
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based access control
  if (ADMIN_PATHS.some(path => pathname.startsWith(path))) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  if (TEACHER_PATHS.some(path => pathname.startsWith(path))) {
    if (!['admin', 'teacher'].includes(role)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  if (STUDENT_PATHS.some(path => pathname.startsWith(path))) {
    if (role !== 'student') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Dashboard accessible by all authenticated users
  if (DASHBOARD_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
};