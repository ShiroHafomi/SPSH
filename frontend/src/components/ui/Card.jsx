/**
 * Card Components - Flexible card layouts with consistent styling
 */

import { forwardRef } from 'react';

// Base Card
const Card = forwardRef(
  (
    {
      children,
      variant = 'default',
      padding = 'default',
      hover = false,
      className = '',
      onClick,
      ...props
    },
    ref
  ) => {
    const variants = {
      default: 'bg-white border border-primary-100 shadow-bento',
      clay: 'bg-white border border-primary-100 shadow-clay-md',
      elevated: 'bg-white border border-primary-100 shadow-lg',
      outlined: 'bg-white border-2 border-primary-200',
      ghost: 'bg-transparent border-none shadow-none',
    };

    const paddings = {
      none: '',
      sm: 'p-4',
      default: 'p-6',
      lg: 'p-8',
    };

    const hoverStyles = hover
      ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-bento-hover hover:border-primary-200 transition-all duration-200'
      : '';

    const interactive = onClick ? 'cursor-pointer' : '';

    return (
      <div
        ref={ref}
        className={`
          rounded-3xl
          ${variants[variant]}
          ${paddings[padding]}
          ${hoverStyles}
          ${interactive}
          ${className}
        `}
        onClick={onClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header
const CardHeader = forwardRef(
  ({ children, className = '', divider = false, ...props }, ref) => (
    <div
      ref={ref}
      className={`flex items-center justify-between gap-4 mb-4 ${divider ? 'pb-4 border-b border-primary-100 dark:border-gray-700' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

// Card Title
const CardTitle = ({ children, className = '', as: Component = 'h3', ...props }) => (
  <Component className={`text-lg font-bold text-primary-950 dark:text-gray-100 ${className}`} {...props}>
    {children}
  </Component>
);

CardTitle.displayName = 'CardTitle';

// Card Description
const CardDescription = ({ children, className = '', ...props }) => (
  <p className={`text-sm text-primary-500 dark:text-gray-400 ${className}`} {...props}>
    {children}
  </p>
);

CardDescription.displayName = 'CardDescription';

// Card Content
const CardContent = forwardRef(
  ({ children, className = '', ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

// Card Footer
const CardFooter = forwardRef(
  ({ children, className = '', divider = true, ...props }, ref) => (
    <div
      ref={ref}
      className={`flex items-center justify-end gap-3 mt-4 ${divider ? 'pt-4 border-t border-primary-100 dark:border-gray-700' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';

// KPI Card - Specialized for dashboard metrics
const KPICard = ({
  label,
  value,
  format = 'number',
  icon,
  trend,
  trendLabel,
  variant = 'default',
  featured = false,
  onClick,
  className = '',
  to,
}) => {
  const formatValue = (val, fmt) => {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (fmt === 'pct') return num.toFixed(1) + '%';
    if (fmt === 'dec1') return num.toFixed(1);
    if (fmt === 'dec2') return num.toFixed(2);
    if (fmt === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    return num.toLocaleString();
  };

  const featuredVariants = {
    primary: 'bg-linear-to-br from-primary-600 to-primary-500',
    success: 'bg-linear-to-br from-success-600 to-emerald-500',
    accent: 'bg-linear-to-br from-accent-500 to-orange-500',
    danger: 'bg-linear-to-br from-danger-600 to-red-500',
  };

  const defaultVariantStyles = {
    default: 'bg-white dark:bg-gray-900 border border-primary-100 dark:border-gray-800',
    clay: 'bg-white border border-primary-100 shadow-clay-sm',
  };

  const Component = to ? 'a' : onClick ? 'button' : 'div';

  const variantClass = featured
    ? featuredVariants[variant] || featuredVariants.primary
    : defaultVariantStyles[variant] || defaultVariantStyles.default;

  const iconColors = {
    primary: 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400',
    success: 'bg-success-100 text-success-600 dark:bg-success-900/40 dark:text-success-400',
    accent: 'bg-accent-100 text-accent-600 dark:bg-accent-900/40 dark:text-accent-400',
    danger: 'bg-danger-100 text-danger-600 dark:bg-danger-900/40 dark:text-danger-400',
    default: 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400',
  };

  const textColors = {
    primary: 'text-primary-900 dark:text-primary-100',
    success: 'text-success-900 dark:text-success-100',
    accent: 'text-accent-900 dark:text-accent-100',
    danger: 'text-danger-900 dark:text-danger-100',
    default: 'text-primary-900 dark:text-primary-100',
  };

  const textClass = featured
    ? 'text-white'
    : textColors[variant] || textColors.default;

  return (
    <Component
      className={`
        kpi-card group relative overflow-hidden rounded-2xl transition-all duration-300
        ${variantClass}
        ${onClick || to ? 'cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
      href={to}
      aria-label={label}
    >
      <div className="flex items-start justify-between">
        <p className={`kpi-label ${featured ? 'text-white/75' : 'text-primary-400'} group:hover:text-white/75 dark:group:hover:text-white/60 transition-colors`}>
          {label}
        </p>
        {icon && (
          <div className={`kpi-icon-box flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform ${iconColors[variant] || iconColors.default}`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`kpi-value ${textClass} font-mono tabular-nums`}>
        {formatValue(value, format)}
      </p>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-sm font-medium ${trend >= 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}`}>
          <span>{trend >= 0 ? '↑' : '↓'}</span>
          <span className="absolute">{Math.abs(trend)}%</span>
          {trendLabel && <span className={featured ? 'text-white/75' : 'text-primary-400 dark:text-gray-500'}>{trendLabel}</span>}
        </div>
      )}
      {featured && to && (
        <span className="inline-flex items-center gap-1 mt-auto text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
          View Details
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        </span>
      )}
    </Component>
  );
};

KPICard.displayName = 'KPICard';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, KPICard };