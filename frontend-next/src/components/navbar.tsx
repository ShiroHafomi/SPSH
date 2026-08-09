'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useLocale } from '@/i18n/navigation';
import { Moon, Sun, Menu, X, LayoutDashboard, Users, GraduationCap, User, BarChart2, AlertTriangle, Bot, Settings, LogOut, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import Cookies from 'js-cookie';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['admin', 'teacher', 'student'] },
  { label: 'Analytics', href: '/admin/analytics', icon: <BarChart2 className="h-4 w-4" />, roles: ['admin'] },
  { label: 'User Management', href: '/admin/users', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  { label: 'At-Risk Students', href: '/admin/at-risk', icon: <AlertTriangle className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Students', href: '/admin/students', icon: <GraduationCap className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Analytics', href: '/teacher/analytics', icon: <BarChart2 className="h-4 w-4" />, roles: ['teacher'] },
  { label: 'Students', href: '/teacher/students', icon: <GraduationCap className="h-4 w-4" />, roles: ['teacher'] },
  { label: 'At-Risk Students', href: '/teacher/at-risk', icon: <AlertTriangle className="h-4 w-4" />, roles: ['teacher'] },
  { label: 'AI Counsel', href: '/teacher/ai-counsel', icon: <Bot className="h-4 w-4" />, roles: ['teacher'] },
  { label: 'My Profile', href: '/student/profile', icon: <User className="h-4 w-4" />, roles: ['student'] },
  { label: 'What-If Simulator', href: '/student/simulator', icon: <BarChart2 className="h-4 w-4" />, roles: ['student'] },
  { label: 'AI Advisor', href: '/student/advisor', icon: <Bot className="h-4 w-4" />, roles: ['student'] },
];

const locales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [langMenuOpen, setLangMenuOpen] = React.useState(false);

  const userRole = Cookies.get('user_role') || 'student';
  const userName = Cookies.get('user_name') || 'User';
  const userEmail = Cookies.get('user_email') || '';

  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));

  const handleLogout = () => {
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    Cookies.remove('user_role');
    Cookies.remove('user_name');
    Cookies.remove('user_email');
    window.location.href = `/${locale}/login`;
  };

  const switchLocale = (newLocale: string) => {
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/dashboard';
    window.location.href = `/${newLocale}${pathWithoutLocale}`;
    setLangMenuOpen(false);
  };

  return (
    <header className="fixed top-4 left-4 right-4 z-50 glass-border rounded-xl bg-background/80 backdrop-blur-sm border border-border/50 shadow-lg transition-all duration-300">
      <nav className="flex h-16 items-center justify-between px-4" aria-label="Main navigation">
        <div className="flex items-center gap-8">
          <Link href={`/${locale}/dashboard`} className="flex items-center gap-2 font-semibold text-xl text-primary">
            <GraduationCap className="h-6 w-6" />
            <span className="hidden sm:block">Student Performance</span>
          </Link>

          <div className="hidden md:flex md:items-center md:gap-1">
            {filteredNavItems.map((item) => (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === `/${locale}${item.href}`
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <DropdownMenu open={langMenuOpen} onOpenChange={setLangMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" align="end" forceMount>
              {locales.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onSelect={() => switchLocale(l.code)}
                  className={cn('flex items-center gap-2', locale === l.code && 'bg-accent')}
                >
                  <span>{l.flag}</span>
                  <span>{l.name}</span>
                  {locale === l.code && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="px-2 py-1">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden px-4 pb-4 border-t border-border/50">
          <div className="flex flex-col gap-1">
            {filteredNavItems.map((item) => (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  pathname === `/${locale}${item.href}`
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}