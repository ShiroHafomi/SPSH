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
    const baseStyles = 'inline-flex items-center justify-center font-semibold transition-colors duration-200 focus-ring select-none disabled:cursor-not-allowed disabled:opacity-50';

    const variants = {
      primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 active:bg-primary-800',
      success: 'bg-success-700 text-white shadow-sm hover:bg-success-800 active:bg-success-900',
      danger: 'bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-800',
      accent: 'bg-accent-700 text-white shadow-sm hover:bg-accent-800 active:bg-accent-900',
      secondary: 'border border-divider bg-surface text-ink shadow-sm hover:bg-surface-muted hover:border-primary-300',
      ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
      outline: 'border border-primary-600 text-primary-700 hover:bg-primary-50 active:bg-primary-100 dark:border-primary-400 dark:text-primary-200 dark:hover:bg-primary-950/50',
    };

    const sizes = {
      sm: 'min-h-11 gap-1.5 rounded-lg px-3 text-sm',
      default: 'min-h-11 gap-2 rounded-xl px-4 text-sm',
      lg: 'min-h-12 gap-2 rounded-xl px-6 text-base',
      icon: 'size-11 shrink-0 rounded-xl p-0',
    };

    const iconNode = (icon) => {
      if (!icon) return null;
      if (typeof icon === 'string') return <Icon name={icon} className="size-4" />;
      return icon;
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        onClick={onClick}
        className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.default} ${fullWidth ? 'w-full' : ''} ${className}`}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="sr-only">{children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{iconNode(leftIcon)}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{iconNode(rightIcon)}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export const PrimaryButton = ({ children, ...props }) => <Button variant="primary" {...props}>{children}</Button>;
export const SuccessButton = ({ children, ...props }) => <Button variant="success" {...props}>{children}</Button>;
export const DangerButton = ({ children, ...props }) => <Button variant="danger" {...props}>{children}</Button>;
export const SecondaryButton = ({ children, ...props }) => <Button variant="secondary" {...props}>{children}</Button>;
export const GhostButton = ({ children, ...props }) => <Button variant="ghost" {...props}>{children}</Button>;
export const OutlineButton = ({ children, ...props }) => <Button variant="outline" {...props}>{children}</Button>;
