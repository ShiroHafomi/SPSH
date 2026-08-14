import { forwardRef } from 'react';

const Badge = forwardRef(function Badge({
  children,
  className = '',
  variant = 'default',
  size = 'default',
  ...props
}, ref) {
  const variants = {
    default: 'badge',
    outline: 'badge border',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    primary: 'badge-primary',
    gray: 'badge-gray',
  };

  const sizes = {
    default: 'px-2.5 py-0.5 text-xs',
    sm: 'px-2 py-0.5 text-[10px]',
    lg: 'px-3 py-1 text-sm',
  };

  return (
    <span
      ref={ref}
      className={`inline-flex items-center ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';

export { Badge };