/**
 * Standard browser confirmation for bulk uploads and other major HR actions.
 */
export function confirmMajorAction(action: string, details?: string | string[]): boolean {
  const lines = ['Are you sure?', '', `You are about to: ${action}`];
  if (details) {
    lines.push('');
    const parts = Array.isArray(details) ? details : [details];
    lines.push(...parts);
  }
  return window.confirm(lines.join('\n'));
}
