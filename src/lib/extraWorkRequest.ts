/** Label shown in UI, emails, and partner review for extra-work requests. */
export const EXTRA_WORK_REQUEST_STATUS = 'Extra work hours';

export type ExtraWorkEntry = {
  startTime: string;
  endTime: string;
  hours: number;
  reason?: string;
  requestId?: string;
  approvedAt?: string;
};

export type ExtraWorkSlotInput = {
  startTime: string;
  endTime: string;
  reason: string;
};

export function isExtraWorkRequest(req: {
  requestType?: string | null;
  requestedStatus?: string | null;
}): boolean {
  return (
    req.requestType === 'extra_work' ||
    String(req.requestedStatus || '').trim() === EXTRA_WORK_REQUEST_STATUS
  );
}

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseExtraWorkTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function calculateExtraWorkHours(startTime: string, endTime: string): number | null {
  const startMinutes = parseExtraWorkTimeToMinutes(startTime);
  const endMinutes = parseExtraWorkTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return null;
  }
  return Number(((endMinutes - startMinutes) / 60).toFixed(2));
}

export function normalizeExtraWorkSlotsFromRequest(req: {
  extraWorkSlots?: ExtraWorkSlotInput[] | null;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}): ExtraWorkSlotInput[] {
  if (Array.isArray(req.extraWorkSlots) && req.extraWorkSlots.length > 0) {
    return req.extraWorkSlots.map((slot) => ({
      startTime: String(slot.startTime || '').trim(),
      endTime: String(slot.endTime || '').trim(),
      reason: String(slot.reason || '').trim(),
    }));
  }
  const startTime = String(req.startTime || '').trim();
  const endTime = String(req.endTime || '').trim();
  if (startTime && endTime) {
    return [{ startTime, endTime, reason: String(req.reason || '').trim() }];
  }
  return [];
}

export function validateExtraWorkSlots(
  slots: ExtraWorkSlotInput[]
): { ok: true; slots: Array<ExtraWorkSlotInput & { hours: number }> } | { ok: false; error: string } {
  if (!Array.isArray(slots) || slots.length === 0) {
    return { ok: false, error: 'Add at least one extra work time slot.' };
  }

  const validated: Array<ExtraWorkSlotInput & { hours: number }> = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const startTime = String(slot.startTime || '').trim();
    const endTime = String(slot.endTime || '').trim();
    const reason = String(slot.reason || '').trim();

    if (!startTime || !endTime) {
      return { ok: false, error: `Slot ${i + 1}: enter both start and end time.` };
    }

    const hours = calculateExtraWorkHours(startTime, endTime);
    if (hours === null || hours <= 0) {
      return {
        ok: false,
        error: `Slot ${i + 1}: use valid 24-hour times with start earlier than end.`,
      };
    }

    if (!reason) {
      return { ok: false, error: `Slot ${i + 1}: provide a work explanation.` };
    }

    validated.push({ startTime, endTime, reason, hours });
  }

  return { ok: true, slots: validated };
}

export function sumExtraWorkEntryHours(
  entries?: Array<{ hours?: number; startTime?: string; endTime?: string }> | null
): number {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  return sumExtraWorkSlotHours(entries);
}

/**
 * After punch-based recalc overwrites totalHour/excessHour, restore approved extra work.
 * Safe to call when extraWorkEntries is empty or missing.
 */
export function reapplyExtraWorkEntriesToRecord(rec: ExtraWorkRecordTarget): number {
  const extraHours = sumExtraWorkEntryHours(rec.extraWorkEntries);
  if (extraHours <= 0) return 0;
  rec.totalHour = Number(((Number(rec.totalHour) || 0) + extraHours).toFixed(2));
  rec.excessHour = Number(((Number(rec.excessHour) || 0) + extraHours).toFixed(2));
  return extraHours;
}

export function sumExtraWorkSlotHours(
  slots: Array<{ hours?: number; startTime?: string; endTime?: string }>
): number {
  let total = 0;
  for (const slot of slots) {
    if (typeof slot.hours === 'number' && Number.isFinite(slot.hours)) {
      total += slot.hours;
      continue;
    }
    const h = calculateExtraWorkHours(
      String(slot.startTime || ''),
      String(slot.endTime || '')
    );
    if (h != null) total += h;
  }
  return Number(total.toFixed(2));
}

export function formatExtraWorkSlotsTimeRange(slots: ExtraWorkSlotInput[]): string {
  return slots
    .map((s) => `${s.startTime}–${s.endTime}`)
    .filter(Boolean)
    .join(', ');
}

export function formatExtraWorkSlotsReasonSummary(slots: ExtraWorkSlotInput[]): string {
  return slots
    .map((s, i) => {
      const range = `${s.startTime}–${s.endTime}`;
      return slots.length > 1 ? `[${range}] ${s.reason}` : s.reason;
    })
    .join(' | ');
}

export type ExtraWorkRecordTarget = {
  totalHour?: number;
  excessHour?: number;
  extraWorkEntries?: ExtraWorkEntry[];
};

export function applyExtraWorkToRecord(
  rec: ExtraWorkRecordTarget,
  params: {
    startTime: string;
    endTime: string;
    reason?: string;
    requestId?: string;
  }
): number {
  return applyExtraWorkSlotsToRecord(rec, [params], params.requestId);
}

/** True when this request's slots are already stored on the day record. */
export function extraWorkRequestAppliedToRecord(
  rec: { extraWorkEntries?: ExtraWorkEntry[] | null } | null | undefined,
  requestId?: string | null
): boolean {
  if (!rec || !requestId) return false;
  const entries = rec.extraWorkEntries;
  if (!Array.isArray(entries) || entries.length === 0) return false;
  const id = String(requestId);
  return entries.some((entry) => String(entry.requestId || '') === id);
}

export function applyExtraWorkSlotsToRecord(
  rec: ExtraWorkRecordTarget,
  slots: Array<{ startTime: string; endTime: string; reason?: string }>,
  requestId?: string
): number {
  const validation = validateExtraWorkSlots(
    slots.map((s) => ({
      startTime: s.startTime,
      endTime: s.endTime,
      reason: String(s.reason || ''),
    }))
  );
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  let added = 0;
  const entries = Array.isArray(rec.extraWorkEntries) ? [...rec.extraWorkEntries] : [];

  for (const slot of validation.slots) {
    rec.totalHour = Number(((Number(rec.totalHour) || 0) + slot.hours).toFixed(2));
    rec.excessHour = Number(((Number(rec.excessHour) || 0) + slot.hours).toFixed(2));
    added += slot.hours;
    entries.push({
      startTime: slot.startTime,
      endTime: slot.endTime,
      hours: slot.hours,
      reason: slot.reason,
      requestId,
      approvedAt: new Date().toISOString(),
    });
  }

  rec.extraWorkEntries = entries;
  return Number(added.toFixed(2));
}

export function formatExtraWorkHoursLabel(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** Punch in/out from a day record (edited times preferred). */
export function getRecordPunchTimeRange(rec: {
  editedCheckin?: string;
  checkin?: string;
  inTime?: string;
  editedCheckout?: string;
  checkout?: string;
  outTime?: string;
} | null | undefined): { inTime: string; outTime: string } {
  return {
    inTime: String(rec?.editedCheckin || rec?.checkin || rec?.inTime || '').trim(),
    outTime: String(rec?.editedCheckout || rec?.checkout || rec?.outTime || '').trim(),
  };
}

export function formatRecordPunchTimeRange(
  rec: Parameters<typeof getRecordPunchTimeRange>[0],
  empty = '—'
): string {
  const { inTime, outTime } = getRecordPunchTimeRange(rec);
  const inLabel = inTime && inTime !== '00:00' ? inTime : empty;
  const outLabel = outTime && outTime !== '00:00' ? outTime : empty;
  return `${inLabel} → ${outLabel}`;
}

/** Comma-separated extra-work slot ranges, e.g. "19:00–21:00, 22:00–23:00". */
export function formatExtraWorkEntriesTimeSummary(
  entries?: Array<{ startTime?: string; endTime?: string }> | null
): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  return entries
    .map((entry) => {
      const start = String(entry.startTime || '').trim();
      const end = String(entry.endTime || '').trim();
      if (!start && !end) return '';
      return `${start || '--:--'}–${end || '--:--'}`;
    })
    .filter(Boolean)
    .join(', ');
}

/** Hours worked from punch only (totalHour minus approved extra work). */
export function getRecordPunchHours(rec: {
  totalHour?: number;
  extraWorkEntries?: Array<{ hours?: number; startTime?: string; endTime?: string }> | null;
} | null | undefined): number {
  const total = Number(rec?.totalHour || 0);
  const extra = sumExtraWorkEntryHours(rec?.extraWorkEntries);
  return Number(Math.max(0, total - extra).toFixed(2));
}
