import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { safeReturnPath } from '../utils/safeNavigation';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const { login } = useAuth();
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const from = location.state?.from || null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const user = await login(data.email, data.password);
      addFlash(t('login.welcome'), 'success');
      const roleHome = homeForRole(user.role);
      navigate(safeReturnPath(from, roleHome), { replace: true });
    } catch (err) {
      addFlash(err.message || t('login.loginFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        {/* Bento split layout: left brand panel (lg+), right form card */}
        <div className="bento-grid lg:grid-cols-2 gap-8 items-center">
          {/* ── Left: Brand Panel ─────────────────────────────────────────── */}
          <div className="hidden lg:block card p-10 h-full">
            <div className="max-w-sm mx-auto text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-clay-md">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-primary-950 dark:text-gray-100 mb-3">{t('login.title')}</h1>
              <p className="text-primary-500 dark:text-gray-400 text-lg mb-8">{t('login.subtitle')}</p>

              <div className="space-y-4 text-left">
                <div className="flex items-center gap-4 p-4 bg-primary-50/60 dark:bg-primary-950/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-primary-950 dark:text-gray-100">{t('login.realtimeAnalytics')}</p>
                    <p className="text-sm text-primary-500 dark:text-gray-400">{t('login.realtimeAnalyticsDesc')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-primary-50/60 dark:bg-primary-950/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-success-100 dark:bg-success-900/40 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-success-600 dark:text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548-.548A3.374 3.374 0 0014 14.469V17a1 1 0 01-.553.894l-.491.246a1.5 1.5 0 00-.553 1.679l.216.871a2 2 0 01-1.935 2.41H13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-primary-950 dark:text-gray-100">{t('login.aiPredictions')}</p>
                    <p className="text-sm text-primary-500 dark:text-gray-400">{t('login.aiPredictionsDesc')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-primary-50/60 dark:bg-primary-950/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-accent-100 dark:bg-accent-900/40 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent-600 dark:text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-primary-950 dark:text-gray-100">{t('login.securePrivate')}</p>
                    <p className="text-sm text-primary-500 dark:text-gray-400">{t('login.securePrivateDesc')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Form Card ──────────────────────────────────────────── */}
          <div className="card-clay-hover p-8 w-full">
            <div className="lg:hidden text-center mb-8">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-clay-md">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">{t('login.signIn')}</h1>
            </div>

            <div className="lg:block text-center mb-8">
              <p className="text-primary-500 dark:text-gray-400">{t('login.welcomeBack')}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {/* Email */}
              <div>
                <label htmlFor="email" className="label">{t('login.email')}</label>
                <input
                  {...register('email')}
                  type="email"
                  id="email"
                  autoComplete="email"
                  placeholder={t('login.emailPlaceholder')}
                  className={`input ${errors.email ? 'border-danger-500 focus:ring-danger-500/20' : ''}`}
                  aria-invalid={errors.email ? 'true' : 'false'}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  disabled={isSubmitting}
                />
                {errors.email && (
                  <p id="email-error" className="mt-1 text-sm text-danger-600 dark:text-danger-400" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="label">{t('login.password')}</label>
                <div className="relative">
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    autoComplete="current-password"
                    placeholder={t('login.passwordPlaceholder')}
                    className={`input pr-12 ${errors.password ? 'border-danger-500 focus:ring-danger-500/20' : ''}`}
                    aria-invalid={errors.password ? 'true' : 'false'}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1 text-sm text-danger-600 dark:text-danger-400" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('common.signingIn')}
                  </span>
                ) : (
                  t('login.signIn')
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-primary-400 dark:text-gray-500">
              {t('login.contactAdmin')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}