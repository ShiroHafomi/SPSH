/**
 * Login Page - Modern, accessible authentication page
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, homeForRole } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { safeReturnPath } from '../utils/safeNavigation';
import {
  Button,
  Input,
  Icon,
} from '../components/ui';

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

  // Feature highlights for the brand panel
  const features = [
    {
      icon: 'barChart',
      color: 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400',
      title: 'login.realtimeAnalytics',
      desc: 'login.realtimeAnalyticsDesc',
    },
    {
      icon: 'brain',
      color: 'bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400',
      title: 'login.aiPredictions',
      desc: 'login.aiPredictionsDesc',
    },
    {
      icon: 'shield',
      color: 'bg-success-100 dark:bg-success-900/40 text-success-600 dark:text-success-400',
      title: 'login.securePrivate',
      desc: 'login.securePrivateDesc',
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-primary-50 dark:bg-gray-950">
      <div className="w-full max-w-5xl">
        {/* Bento split layout: left brand panel (lg+), right form card */}
        <div className="bento-grid lg:grid-cols-2 gap-8 items-start">
          {/* ── Left: Brand Panel ─────────────────────────────────────────── */}
          <div className="hidden lg:block card-clay p-10 h-[500px]">
            <div className="max-w-sm mx-auto text-center h-full flex flex-col justify-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-clay-md">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                </svg>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary-950 dark:text-gray-100 mb-3">{t('login.title')}</h1>
              <p className="text-primary-500 dark:text-gray-400 text-lg mb-10">{t('login.subtitle')}</p>

              <div className="space-y-4 text-left">
                {features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 hover:shadow-clay-sm" style={{ backgroundColor: `var(--tw-bg-opacity)` }}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${feature.color}`}>
                      <Icon name={feature.icon} className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-primary-950 dark:text-gray-100">{t(feature.title)}</p>
                      <p className="text-sm text-primary-500 dark:text-gray-400">{t(feature.desc)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: Form Card ──────────────────────────────────────────── */}
          <div className="card-clay-hover p-8 w-full">
            {/* Mobile brand header */}
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
              <Input
                {...register('email')}
                label={t('login.email')}
                type="email"
                placeholder={t('login.emailPlaceholder')}
                autoComplete="email"
                error={errors.email?.message}
                required
                disabled={isSubmitting}
                leftIcon="mail"
              />

              {/* Password */}
              <Input
                {...register('password')}
                label={t('login.password')}
                type={showPassword ? 'text' : 'password'}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                error={errors.password?.message}
                required
                disabled={isSubmitting}
                leftIcon="lock"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 text-primary-400 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  >
                    {showPassword ? (
                      <Icon name="eyeOff" className="w-5 h-5" />
                    ) : (
                      <Icon name="eye" className="w-5 h-5" />
                    )}
                  </button>
                }
              />

              {/* Submit */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={isSubmitting}
                loading={isSubmitting}
                leftIcon={isSubmitting ? undefined : 'logIn'}
              >
                {isSubmitting ? t('common.signingIn') : t('login.signIn')}
              </Button>
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