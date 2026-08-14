import { forwardRef } from 'react';

const Button = forwardRef(function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled,
  type = 'button',
  onClick,
  'aria-label': ariaLabel,
  ...props
}, ref) {
  const variants = {
    primary: 'btn btn-primary',
    success: 'btn btn-success',
    danger: 'btn btn-danger',
    secondary: 'btn btn-secondary',
    outline: 'btn border border-primary-300 text-primary-700 hover:bg-primary-50 dark:border-gray-600 dark:text-primary-400 dark:hover:bg-gray-800',
    ghost: 'btn btn-ghost',
  };

  const sizes = {
    default: 'px-4 py-2.5 text-sm',
    sm: 'px-3 py-1.5 text-xs',
    lg: 'px-6 py-3 text-lg',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={loading ? undefined : ariaLabel}
      aria-busy={loading}
      aria-disabled={isDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export { Button };