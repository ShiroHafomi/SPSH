/**
 * Button Component - Reusable button with variants, sizes, and states
 */

import { forwardRef } from 'react';
import { Icon } from './Icons';

const Button = forwardRef(
  (
    {
      children,
      variant = 'primary',
      size = 'default',
      disabled = false,
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      type = 'button',
      onClick,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus-ring select-none disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-clay-sm hover:shadow-clay-md',
      success: 'bg-success-700 text-white hover:bg-success-800 active:bg-success-900 shadow-clay-sm hover:shadow-clay-md',
      danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 shadow-clay-sm hover:shadow-clay-md',
      accent: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 shadow-clay-sm hover:shadow-clay-md',
      secondary: 'bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 hover:border-primary-300 shadow-sm dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-800 dark:hover:border-gray-500',
      ghost: 'text-primary-600 hover:bg-primary-100 dark:text-gray-300 dark:hover:bg-gray-800',
      outline: 'border-2 border-primary-600 text-primary-600 hover:bg-primary-50 hover:text-primary-700 active:bg-primary-100 dark:border-primary-300 dark:text-primary-200 dark:hover:bg-primary-950/50 dark:hover:text-primary-100 dark:active:bg-primary-900/60',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
      default: 'px-4 py-2.5 text-sm gap-2 rounded-xl',
      lg: 'px-6 py-3 text-base gap-2 rounded-2xl',
      icon: 'size-9 p-0 rounded-xl',
    };

    const width = fullWidth ? 'w-full' : '';

    const iconNode = (icon) => {
      if (!icon) return null;
      if (typeof icon === 'string') {
        return <Icon name={icon} className="w-4 h-4" />;
      }
      return icon;
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        onClick={onClick}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${width} ${className}`}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="sr-only">{children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{iconNode(leftIcon)}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{iconNode(rightIcon)}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };

// Convenience exports
export const PrimaryButton = ({ children, ...props }) => <Button variant="primary" {...props}>{children}</Button>;
export const SuccessButton = ({ children, ...props }) => <Button variant="success" {...props}>{children}</Button>;
export const DangerButton = ({ children, ...props }) => <Button variant="danger" {...props}>{children}</Button>;
export const SecondaryButton = ({ children, ...props }) => <Button variant="secondary" {...props}>{children}</Button>;
export const GhostButton = ({ children, ...props }) => <Button variant="ghost" {...props}>{children}</Button>;
export const OutlineButton = ({ children, ...props }) => <Button variant="outline" {...props}>{children}</Button>;