import { forwardRef } from 'react';

const Card = forwardRef(function Card({
  children,
  className = '',
  hover = false,
  clay = false,
  ...props
}, ref) {
  let baseClasses = 'card';

  if (clay) {
    baseClasses = 'card-clay';
  }

  if (hover) {
    baseClasses = clay ? 'card-clay-hover' : 'card-hover';
  }

  return (
    <div
      ref={ref}
      className={`${baseClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export { Card };