import { CheckCircle2, CircleAlert, Clock3, Info } from 'lucide-react';
import { Badge } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { getProgressStatusPresentation } from '../../utils/goalProgress';

const ICONS = {
  check: CheckCircle2,
  alert: CircleAlert,
  clock: Clock3,
  info: Info,
};

const TONE_VARIANTS = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  primary: 'default',
  neutral: 'gray',
};

export default function ProgressStatusBadge({ status, className = '' }) {
  const { t } = useLanguage();
  const presentation = getProgressStatusPresentation(status);
  const Icon = ICONS[presentation.icon] || Info;
  const label = t(presentation.labelKey);

  return (
    <Badge
      variant={TONE_VARIANTS[presentation.tone] || 'gray'}
      className={className}
      role="status"
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
