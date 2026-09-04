import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { useFlash } from './FlashProvider';
import { FlashContainer } from './FlashMessage';
import { NotificationBell } from './NotificationBell';
import { Avatar, Button, Icon } from './ui';
import {
  getDrawerStateAfterAction,
  getNavigationForRole,
  getPageContext,
  isNavigationItemActive,
} from './appShell';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

function FlashArea() {
  const { messages, removeFlash } = useFlash();
  return (
    <FlashContainer messages={messages} onRemove={removeFlash} />
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { lang, t, toggleLang } = useLanguage();
  const { addFlash } = useFlash();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const menuButtonRef = useRef(null);

  const navigation = getNavigationForRole(user?.role);
  const pageContext = getPageContext(user?.role, location.pathname);
  const workspaceTitle = t(`shell.workspace.${user?.role}`);
  const pageTitle = pageContext ? t(pageContext.labelKey) : workspaceTitle;

  const closeDrawer = useCallback((action = 'close') => {
    setDrawerOpen((current) => getDrawerStateAfterAction(current, action));
  }, []);

  useEffect(() => {
    closeDrawer('navigate');
  }, [location.pathname, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer('escape');
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = drawerRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      (previousActiveElement || menuButtonRef.current)?.focus?.();
    };
  }, [drawerOpen, closeDrawer]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setLoggingOut(false);
      addFlash(t('shell.logoutFailed'), 'error');
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink transition-colors duration-200">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-toast -translate-y-24 rounded-lg bg-action px-4 py-2.5 font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        {t('shell.skipToContent')}
      </a>

      <aside
        ref={drawerRef}
        id="app-navigation"
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? 'true' : undefined}
        aria-label={t('shell.navigation')}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-2.5rem))] flex-col border-r border-divider bg-surface shadow-xl transition-transform duration-200 lg:visible lg:w-72 lg:translate-x-0 lg:shadow-none ${
          drawerOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex min-h-16 items-center gap-3 border-b border-divider px-4 sm:px-5">
          <Link
            to={homeForRole(user?.role)}
            className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2"
            onClick={() => closeDrawer('navigate')}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-action text-white shadow-sm">
              <Icon name="graduationCap" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold leading-tight text-ink">SPSH</span>
              <span className="block truncate text-xs text-ink-muted">{t('nav.studentPerformance')}</span>
            </span>
          </Link>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => closeDrawer('close')}
            aria-label={t('shell.closeNavigation')}
          >
            <Icon name="x" className="size-5" />
          </Button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label={t('shell.primaryNavigation')}>
          {navigation.map((group) => (
            <section key={group.labelKey} className="mb-5 last:mb-0">
              <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                {t(group.labelKey)}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isNavigationItemActive(location.pathname, item);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.exact}
                      onClick={() => closeDrawer('navigate')}
                      aria-current={active ? 'page' : undefined}
                      className={`focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200 ${
                        active
                          ? 'bg-action-muted text-action-strong shadow-sm'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                      }`}
                    >
                      <Icon name={item.icon} className="size-5" />
                      <span className="min-w-0 break-words leading-snug">{t(item.labelKey)}</span>
                    </NavLink>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="border-t border-divider p-3">
          <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-2.5">
            <Avatar name={user?.name} size="default" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
              <p className="text-xs text-ink-muted">{t(`nav.role.${user?.role}`)}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              loading={loggingOut}
              onClick={handleLogout}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
            >
              <Icon name="logOut" className="size-5" />
            </Button>
          </div>
        </div>
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] lg:hidden"
          onClick={() => closeDrawer('close')}
          aria-label={t('shell.closeNavigation')}
          tabIndex={-1}
        />
      )}

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-sticky border-b border-divider bg-surface/95 backdrop-blur-md">
          <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                ref={menuButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setDrawerOpen((current) => getDrawerStateAfterAction(current, 'toggle'))}
                aria-label={t('shell.openNavigation')}
                aria-expanded={drawerOpen}
                aria-controls="app-navigation"
              >
                <Icon name="menu" className="size-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink-muted">{workspaceTitle}</p>
                <p className="truncate text-base font-bold text-ink sm:text-lg">{pageTitle}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <NotificationBell />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleLang}
                aria-label={t('nav.switchLang', { lang: lang === 'en' ? 'Tiếng Việt' : 'English' })}
                title={t('nav.switchLang', { lang: lang === 'en' ? 'Tiếng Việt' : 'English' })}
              >
                <span className="text-xs font-bold" aria-hidden="true">{lang.toUpperCase()}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label={isDark ? t('nav.switchToLight') : t('nav.switchToDark')}
                title={isDark ? t('nav.switchToLight') : t('nav.switchToDark')}
              >
                <Icon name={isDark ? 'sun' : 'moon'} className="size-5" />
              </Button>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="scroll-mt-20 outline-none">
          <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <FlashArea />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
