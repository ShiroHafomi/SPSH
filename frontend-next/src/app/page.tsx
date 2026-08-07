'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get('access_token');
    const role = Cookies.get('user_role');

    if (token && role) {
      if (role === 'admin') {
        router.push('/admin/analytics');
      } else if (role === 'teacher') {
        router.push('/teacher/analytics');
      } else {
        router.push('/student/profile');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  return null;
}