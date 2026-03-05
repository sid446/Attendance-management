// Client-side helper to check if a date is a holiday from the database
export async function isHolidayDate(date: string): Promise<boolean> {
  // date: YYYY-MM-DD
  const year = date.substring(0, 4);
  try {
    const res = await fetch(`/api/holidays?year=${year}&activeOnly=true`);
    if (!res.ok) return false;
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return false;
    return json.data.some((h: any) => h.date === date);
  } catch {
    return false;
  }
}
