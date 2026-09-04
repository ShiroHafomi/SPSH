import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

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
      default: 'border border-divider bg-surface shadow-bento',
      clay: 'border border-divider bg-surface shadow-clay-md',
      elevated: 'border border-divider bg-surface shadow-clay-lg',
      outlined: 'border border-divider bg-surface',
      ghost: 'border-0 bg-transparent shadow-none',
    };
    const paddings = {
      none: '',
      sm: 'p-4',
      default: 'p-5 sm:p-6',
      lg: 'p-6 sm:p-8',
    };
    const interactive = hover || onClick;

    return (
      <div
        ref={ref}
        className={`rounded-2xl ${variants[variant] || variants.default} ${paddings[padding] || paddings.default} ${
          interactive ? 'cursor-pointer transition-colors duration-200 hover:border-primary-300 hover:bg-surface-muted' : ''
        } ${className}`}
        onClick={onClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

const CardHeader = forwardRef(
  ({ children, className = '', divider = false, ...props }, ref) => (
    <div
      ref={ref}
      className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${divider ? 'border-b border-divider pb-4' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = ({ children, className = '', as: Component = 'h3', ...props }) => (
  <Component className={`text-lg font-bold text-ink ${className}`} {...props}>{children}</Component>
);
CardTitle.displayName = 'CardTitle';

const CardDescription = ({ children, className = '', ...props }) => (
  <p className={`text-sm text-ink-muted ${className}`} {...props}>{children}</p>
);
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef(({ children, className = '', ...props }, ref) => (
  <div ref={ref} className={className} {...props}>{children}</div>
));
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef(({ children, className = '', divider = true, ...props }, ref) => (
  <div
    ref={ref}
    className={`mt-4 flex flex-wrap items-center justify-end gap-3 ${divider ? 'border-t border-divider pt-4' : ''} ${className}`}
    {...props}
  >
    {children}
  </div>
));
CardFooter.displayName = 'CardFooter';

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
  const { lang, t } = useLanguage();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const formatValue = (rawValue, valueFormat) => {
    if (rawValue === null || rawValue === undefined) return '—';
    const number = Number(rawValue);
    if (!Number.isFinite(number)) return rawValue;
    if (valueFormat === 'pct') return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(number) + '%';
    if (valueFormat === 'dec1') return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(number);
    if (valueFormat === 'dec2') return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
    if (valueFormat === 'currency') return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(number);
    return new Intl.NumberFormat(locale).format(number);
  };

  const featuredVariants = {
    primary: 'border-primary-600 bg-primary-600',
    success: 'border-success-700 bg-success-700',
    accent: 'border-accent-700 bg-accent-700',
    danger: 'border-danger-600 bg-danger-600',
  };
  const iconColors = {
    primary: 'bg-primary-100 text-primary-700 dark:bg-primary-950/70 dark:text-primary-200',
    success: 'bg-success-100 text-success-700 dark:bg-success-950/70 dark:text-success-200',
    accent: 'bg-accent-100 text-accent-700 dark:bg-accent-950/70 dark:text-accent-200',
    danger: 'bg-danger-100 text-danger-700 dark:bg-danger-950/70 dark:text-danger-200',
    default: 'bg-primary-100 text-primary-700 dark:bg-primary-950/70 dark:text-primary-200',
  };
  const componentProps = to ? { to } : { onClick };
  const Component = to ? Link : onClick ? 'button' : 'div';
  const isInteractive = Boolean(to || onClick);

  return (
    <Component
      className={`kpi-card relative overflow-hidden text-left ${
        featured ? `${featuredVariants[variant] || featuredVariants.primary} text-white` : ''
      } ${isInteractive ? 'focus-ring transition-colors duration-200 hover:border-primary-300' : ''} ${className}`}
      aria-label={isInteractive ? label : undefined}
      {...componentProps}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`kpi-label ${featured ? 'text-white/80' : ''}`}>{label}</p>
        {icon && (
          <div className={`kpi-icon-box ${featured ? 'bg-white/15 text-white' : iconColors[variant] || iconColors.default}`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`kpi-value ${featured ? 'text-white' : ''}`}>{formatValue(value, format)}</p>
      {trend !== undefined && Number.isFinite(Number(trend)) && (
        <div className={`flex flex-wrap items-center gap-1.5 text-sm font-medium ${
          featured ? 'text-white/90' : Number(trend) >= 0 ? 'text-success-700 dark:text-success-300' : 'text-danger-700 dark:text-danger-300'
        }`}>
          <span aria-hidden="true">{Number(trend) >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(Number(trend))}%</span>
          {trendLabel && <span className={featured ? 'text-white/75' : 'text-ink-muted'}>{trendLabel}</span>}
        </div>
      )}
      {featured && to && (
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-white">
          {t('common.viewDetails')}
          <span aria-hidden="true">→</span>
        </span>
      )}
    </Component>
  );
};
KPICard.displayName = 'KPICard';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, KPICard };
