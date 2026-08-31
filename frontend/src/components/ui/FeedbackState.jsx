import { useLanguage } from '../../hooks/useLanguage';
import { Button } from './Button';
import { Icon } from './Icons';

function FeedbackState({
  icon,
  title,
  description,
  action,
  actionLabel,
  variant = 'empty',
  className = '',
  role,
}) {
  const { t } = useLanguage();
  const config = {
    empty: {
      icon: 'database',
      box: 'bg-surface-muted text-ink-muted',
      title: t('common.noData'),
    },
    error: {
      icon: 'alertCircle',
      box: 'bg-danger-100 text-danger-700 dark:bg-danger-950/60 dark:text-danger-300',
      title: t('common.failedToLoad'),
    },
  }[variant] || {};

  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-surface px-5 py-10 text-center ${className}`} role={role || (variant === 'error' ? 'alert' : 'status')}>
      <span className={`mb-4 flex size-12 items-center justify-center rounded-xl ${config.box}`}>
        <Icon name={icon || config.icon} className="size-6" />
      </span>
      <h2 className="text-base font-bold text-ink">{title || config.title}</h2>
      {description && <p className="mt-1 max-w-lg text-sm text-ink-muted">{description}</p>}
      {action && (
        <Button variant={variant === 'error' ? 'primary' : 'secondary'} onClick={action} className="mt-4">
          {actionLabel || t('common.tryAgain')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState(props) {
  return <FeedbackState variant="empty" {...props} />;
}

export function ErrorState(props) {
  return <FeedbackState variant="error" {...props} />;
}
