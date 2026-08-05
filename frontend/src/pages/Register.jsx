import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useFlash } from '../components/FlashProvider';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

export default function Register() {
  const { register: registerUser } = useAuth();
  const { addFlash } = useFlash();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirm_password: '' },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await registerUser(data.name, data.email, data.password, data.confirm_password);
      addFlash('Account created successfully!', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      addFlash(err.message || 'Registration failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="card p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-success-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">Create Account</h1>
          <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">The first user gets admin privileges</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="name" className="label">Full Name</label>
            <input
              {...register('name')}
              type="text"
              id="name"
              autoComplete="name"
              placeholder="Your full name"
              className={`input ${errors.name ? 'border-danger-500 focus:ring-danger-500' : ''}`}
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="mt-1 text-sm text-danger-600" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              {...register('email')}
              type="email"
              id="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={`input ${errors.email ? 'border-danger-500 focus:ring-danger-500' : ''}`}
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-sm text-danger-600" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              {...register('password')}
              type="password"
              id="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className={`input ${errors.password ? 'border-danger-500 focus:ring-danger-500' : ''}`}
              aria-invalid={errors.password ? 'true' : 'false'}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            {errors.password && (
              <p id="password-error" className="mt-1 text-sm text-danger-600" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirm_password" className="label">Confirm Password</label>
            <input
              {...register('confirm_password')}
              type="password"
              id="confirm_password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              className={`input ${errors.confirm_password ? 'border-danger-500 focus:ring-danger-500' : ''}`}
              aria-invalid={errors.confirm_password ? 'true' : 'false'}
              aria-describedby={errors.confirm_password ? 'confirm-error' : undefined}
            />
            {errors.confirm_password && (
              <p id="confirm-error" className="mt-1 text-sm text-danger-600" role="alert">
                {errors.confirm_password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-success w-full"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-primary-400 dark:text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}