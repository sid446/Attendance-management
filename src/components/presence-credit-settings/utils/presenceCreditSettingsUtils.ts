import type { PresenceCreditRuleLike } from '@/lib/presenceCredit';
import type { Person } from '../types';
import { SCOPE_LABEL } from '../constants';

export function scopeLabel(rule: PresenceCreditRuleLike, people: Person[]): string {
  if (rule.scope === 'team') return rule.team ? `Team: ${rule.team}` : 'Team';
  if (rule.scope === 'people') {
    const names = (rule.userIds || [])
      .map((id) => people.find((p) => p._id === id)?.name || id)
      .filter(Boolean);
    if (names.length === 0) return 'Selected people';
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  }
  return SCOPE_LABEL[rule.scope] || rule.scope;
}
