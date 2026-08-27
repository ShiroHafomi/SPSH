import { CheckCircle2, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Badge } from './ui';
import { getDriftStatusPresentation } from '../utils/mlMonitoring';

const ICONS = {
  check: CheckCircle2,
  warning: TriangleAlert,
  danger: OctagonAlert,
  unknown: CircleHelp,
};

export function DriftStatusBadge({ status, t, size = 'default', className = '' }) {
  const presentation = getDriftStatusPresentation(status);
  const StatusIcon = ICONS[presentation.icon];
  const label = t(presentation.labelKey);

  return (
    <Badge
      variant={presentation.variant}
      size={size}
      className={className}
      role="status"
      aria-label={t('mlMonitoring.status.accessible', { status: label })}
    >
      <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
