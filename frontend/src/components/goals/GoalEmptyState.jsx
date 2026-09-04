import { Target } from 'lucide-react';
import { Button, Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';

export default function GoalEmptyState({ onCreate, canCreate = false, description }) {
  const { t } = useLanguage();

  return (
    <Card padding="lg" className="py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-action-muted text-action-strong">
        <Target className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-ink">{t('goals.noGoals')}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{description || t('goals.noGoalsDesc')}</p>
      {canCreate && (
        <Button className="mt-6" onClick={onCreate} leftIcon="plus">
          {t('goals.createGoal')}
        </Button>
      )}
    </Card>
  );
}
