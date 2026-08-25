import { CheckCircle2, CircleAlert, Clock3, Info } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { getProgressStatusPresentation } from '../../utils/goalProgress';

const ICONS = {
  check: CheckCircle2,
  alert: CircleAlert,
  clock: Clock3,
  info: Info,
};

const TONES = {
  success: 'bg-success-100 text-success-700 dark:bg-success-950/40 dark:text-success-300',
  danger: 'bg-danger-100 text-danger-700 dark:bg-danger-950/40 dark:text-danger-300',
  warning: 'bg-warning-100 text-warning-700 dark:bg-warning-950/40 dark:text-warning-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export default function ProgressStatusBadge({ status, className = '' }) {
  const { t } = useLanguage();
  const presentation = getProgressStatusPresentation(status);
  const Icon = ICONS[presentation.icon] || Info;
  const label = t(presentation.labelKey);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[presentation.tone]} ${className}`}
      role="status"
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
