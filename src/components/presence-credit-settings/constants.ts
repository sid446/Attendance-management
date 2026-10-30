import type { PresenceCreditScope } from '@/lib/presenceCredit';

export const SCOPE_LABEL: Record<PresenceCreditScope, string> = {
  everyone: 'Everyone',
  articles: 'Articles and interns',
  staff: 'Employees only',
  team: 'One team',
  people: 'Selected people',
};
