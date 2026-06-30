/** Sort by attendance date (newest first). */
export function requestDateToTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function compareRequestsByDateDesc(aDate: string, bDate: string): number {
  return requestDateToTime(bDate) - requestDateToTime(aDate);
}
