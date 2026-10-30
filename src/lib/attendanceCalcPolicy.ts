import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { toAttendanceDateKey } from '@/lib/presenceCredit';

/** How one side of a punch (early in or late out) is turned into extra minutes. */
export type EdgeCountStyle = 'none' | 'all' | 'all-if-over' | 'only-beyond';
/** A day shorter than the schedule. */
export type ShortfallStyle = 'full' | 'only-beyond' | 'none';
/** Compare the whole worked length, or early arrival and late leaving separately. */
export type ExcessMethod = 'duration' | 'edges';
/** What happens when the difference is larger than the grace. */
export type DurationGraceStyle = 'full-if-over' | 'only-beyond';

/** Numbers and yes/no choices that used to be hardcoded in excess, late arrival, and half-day checks. */
export type AttendanceCalcPolicy = {
  /** Articles: minutes before scheduled in count as extra. Kept so older saved versions still load. */
  articleEarlyInCounts: boolean;
  articleExcessStyle: ExcessMethod;
  articleEarlyInStyle: EdgeCountStyle;
  articleEarlyInGraceMinutes: number;
  articleLateOutStyle: EdgeCountStyle;
  /**
   * Articles: late leaving counts only when it is more than this many minutes
   * after scheduled out. When it counts, all of those late minutes count.
   */
  articleLateOutGraceMinutes: number;
  articleShortfallStyle: ShortfallStyle;
  articleShortfallGraceMinutes: number;
  articleDurationGraceMinutes: number;
  articleDurationGraceStyle: DurationGraceStyle;
  /** Staff: differences within this many minutes count as zero. 0 means every minute counts. */
  staffGraceMinutes: number;
  staffExcessStyle: ExcessMethod;
  staffGraceStyle: DurationGraceStyle;
  staffEarlyInStyle: EdgeCountStyle;
  staffEarlyInGraceMinutes: number;
  staffLateOutStyle: EdgeCountStyle;
  staffLateOutGraceMinutes: number;
  staffShortfallStyle: ShortfallStyle;
  staffShortfallGraceMinutes: number;
  /** A half day uses half of that day's scheduled hours. */
  halfDayUsesHalfSchedule: boolean;
  /** Share of that day's scheduled hours used on a half day. 0.5 is half, 1 is the full day. */
  halfDayScheduledShare: number;
  /** Leave, absent, Sunday, holiday, and week off: punch extra and short stay 0. */
  zeroPunchExcessOnOffDays: boolean;
  zeroExcessOnLeave: boolean;
  zeroExcessOnAbsent: boolean;
  zeroExcessOnSunday: boolean;
  zeroExcessOnHoliday: boolean;
  zeroExcessOnWeekoff: boolean;
  /** Approved extra work still counts on Sunday, holiday, and week off. */
  countApprovedExtraOnOffDays: boolean;
  /** Work from home and outstation: no hour extra or short. */
  zeroExcessOnWfhOsp: boolean;
  zeroExcessOnWfh: boolean;
  zeroExcessOnOsp: boolean;
  /** Check-in from this time, until the absent time, marks a half day. HH:MM. */
  lateCheckinHalfDayStart: string;
  /** Check-in at or after this time marks the day absent. HH:MM. */
  lateCheckinAbsentFrom: string;
  lateHalfDayEnabled: boolean;
  lateAbsentEnabled: boolean;
  /** Half-time employees are skipped unless this is on. */
  lateRulesForHalftime: boolean;
  separateArticleLateWindow: boolean;
  articleLateCheckinHalfDayStart: string;
  articleLateCheckinAbsentFrom: string;
  /** Full-time: half day when worked hours are below this, and never above that day's schedule. */
  fulltimeAutoHalfDayHours: number;
  fulltimeAutoHalfDayEnabled: boolean;
  /** Never mark a full-time half day above that day's own scheduled length. */
  fulltimeCapAtSchedule: boolean;
  fulltimeAlsoAfterCheckin: boolean;
  fulltimeAutoHalfDayFrom: string;
  /** Articles: half day when check-in is at or after this time. HH:MM. */
  articleAutoHalfDayFrom: string;
  articleAutoHalfDayByTime: boolean;
  /** Articles: half day when worked hours are below this. */
  articleAutoHalfDayBelowHours: number;
  articleAutoHalfDayByHours: boolean;
  /** One punch (in or out missing) marks a half day. */
  singlePunchIsHalfDay: boolean;
  /** Interns follow the article extra, late, and half-day rules. */
  internUsesArticleRules: boolean;
  /** A schedule day that is already a half day is left alone. */
  skipScheduledHalfDay: boolean;
};

export type AttendanceCalcPolicyVersion = AttendanceCalcPolicy & {
  _id?: string;
  effectiveFrom: string;
  updatedBy?: string;
  createdAt?: string;
};

export const BUILTIN_ATTENDANCE_CALC_POLICY: AttendanceCalcPolicy = {
  articleEarlyInCounts: true,
  articleExcessStyle: 'edges',
  articleEarlyInStyle: 'all',
  articleEarlyInGraceMinutes: 0,
  articleLateOutStyle: 'all-if-over',
  articleLateOutGraceMinutes: 30,
  articleShortfallStyle: 'full',
  articleShortfallGraceMinutes: 0,
  articleDurationGraceMinutes: 0,
  articleDurationGraceStyle: 'full-if-over',
  staffGraceMinutes: 0,
  staffExcessStyle: 'duration',
  staffGraceStyle: 'full-if-over',
  staffEarlyInStyle: 'all',
  staffEarlyInGraceMinutes: 0,
  staffLateOutStyle: 'all',
  staffLateOutGraceMinutes: 0,
  staffShortfallStyle: 'full',
  staffShortfallGraceMinutes: 0,
  halfDayUsesHalfSchedule: true,
  halfDayScheduledShare: 0.5,
  zeroPunchExcessOnOffDays: true,
  zeroExcessOnLeave: true,
  zeroExcessOnAbsent: true,
  zeroExcessOnSunday: true,
  zeroExcessOnHoliday: true,
  zeroExcessOnWeekoff: true,
  countApprovedExtraOnOffDays: true,
  zeroExcessOnWfhOsp: true,
  zeroExcessOnWfh: true,
  zeroExcessOnOsp: true,
  lateCheckinHalfDayStart: '13:00',
  lateCheckinAbsentFrom: '15:00',
  lateHalfDayEnabled: true,
  lateAbsentEnabled: true,
  lateRulesForHalftime: false,
  separateArticleLateWindow: false,
  articleLateCheckinHalfDayStart: '13:00',
  articleLateCheckinAbsentFrom: '15:00',
  fulltimeAutoHalfDayHours: 6,
  fulltimeAutoHalfDayEnabled: true,
  fulltimeCapAtSchedule: true,
  fulltimeAlsoAfterCheckin: false,
  fulltimeAutoHalfDayFrom: '13:00',
  articleAutoHalfDayFrom: '13:00',
  articleAutoHalfDayByTime: true,
  articleAutoHalfDayBelowHours: 3.5,
  articleAutoHalfDayByHours: true,
  singlePunchIsHalfDay: true,
  internUsesArticleRules: false,
  skipScheduledHalfDay: true,
};

const EDGE_STYLES: EdgeCountStyle[] = ['none', 'all', 'all-if-over', 'only-beyond'];
const SHORTFALL_STYLES: ShortfallStyle[] = ['full', 'only-beyond', 'none'];
const EXCESS_METHODS: ExcessMethod[] = ['duration', 'edges'];
const DURATION_STYLES: DurationGraceStyle[] = ['full-if-over', 'only-beyond'];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

let runtimeVersions: AttendanceCalcPolicyVersion[] | null = null;

/** Process-local list. Null means nothing has been loaded, so calculations use the original numbers. */
export function setRuntimeAttendanceCalcPolicies(versions: AttendanceCalcPolicyVersion[] | null): void {
  runtimeVersions = versions;
}

export function todayAttendanceDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timeOr(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : fallback;
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = String(value || '') as T;
  return allowed.includes(text) ? text : fallback;
}

function shareOr(value: unknown, halfFlag: unknown): number {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
  if (halfFlag === false) return 1;
  return 0.5;
}

export function policyValues(version: Partial<AttendanceCalcPolicy> | null | undefined): AttendanceCalcPolicy {
  const base = BUILTIN_ATTENDANCE_CALC_POLICY;
  const row = version || {};
  const offDay = boolOr(row.zeroPunchExcessOnOffDays, base.zeroPunchExcessOnOffDays);
  const remote = boolOr(row.zeroExcessOnWfhOsp, base.zeroExcessOnWfhOsp);
  const earlyStyle = enumOr(
    row.articleEarlyInStyle,
    EDGE_STYLES,
    row.articleEarlyInCounts === false ? 'none' : base.articleEarlyInStyle
  );
  const share = shareOr(row.halfDayScheduledShare, row.halfDayUsesHalfSchedule);
  const zeroExcessOnLeave = boolOr(row.zeroExcessOnLeave, offDay);
  const zeroExcessOnAbsent = boolOr(row.zeroExcessOnAbsent, offDay);
  const zeroExcessOnSunday = boolOr(row.zeroExcessOnSunday, offDay);
  const zeroExcessOnHoliday = boolOr(row.zeroExcessOnHoliday, offDay);
  const zeroExcessOnWeekoff = boolOr(row.zeroExcessOnWeekoff, offDay);
  const zeroExcessOnWfh = boolOr(row.zeroExcessOnWfh, remote);
  const zeroExcessOnOsp = boolOr(row.zeroExcessOnOsp, remote);
  return {
    articleEarlyInCounts: earlyStyle !== 'none',
    articleExcessStyle: enumOr(row.articleExcessStyle, EXCESS_METHODS, base.articleExcessStyle),
    articleEarlyInStyle: earlyStyle,
    articleEarlyInGraceMinutes: numOr(row.articleEarlyInGraceMinutes, base.articleEarlyInGraceMinutes),
    articleLateOutStyle: enumOr(row.articleLateOutStyle, EDGE_STYLES, base.articleLateOutStyle),
    articleLateOutGraceMinutes: numOr(row.articleLateOutGraceMinutes, base.articleLateOutGraceMinutes),
    articleShortfallStyle: enumOr(row.articleShortfallStyle, SHORTFALL_STYLES, base.articleShortfallStyle),
    articleShortfallGraceMinutes: numOr(row.articleShortfallGraceMinutes, base.articleShortfallGraceMinutes),
    articleDurationGraceMinutes: numOr(row.articleDurationGraceMinutes, base.articleDurationGraceMinutes),
    articleDurationGraceStyle: enumOr(row.articleDurationGraceStyle, DURATION_STYLES, base.articleDurationGraceStyle),
    staffGraceMinutes: numOr(row.staffGraceMinutes, base.staffGraceMinutes),
    staffExcessStyle: enumOr(row.staffExcessStyle, EXCESS_METHODS, base.staffExcessStyle),
    staffGraceStyle: enumOr(row.staffGraceStyle, DURATION_STYLES, base.staffGraceStyle),
    staffEarlyInStyle: enumOr(row.staffEarlyInStyle, EDGE_STYLES, base.staffEarlyInStyle),
    staffEarlyInGraceMinutes: numOr(row.staffEarlyInGraceMinutes, base.staffEarlyInGraceMinutes),
    staffLateOutStyle: enumOr(row.staffLateOutStyle, EDGE_STYLES, base.staffLateOutStyle),
    staffLateOutGraceMinutes: numOr(row.staffLateOutGraceMinutes, base.staffLateOutGraceMinutes),
    staffShortfallStyle: enumOr(row.staffShortfallStyle, SHORTFALL_STYLES, base.staffShortfallStyle),
    staffShortfallGraceMinutes: numOr(row.staffShortfallGraceMinutes, base.staffShortfallGraceMinutes),
    halfDayUsesHalfSchedule: share < 0.999,
    halfDayScheduledShare: share,
    zeroPunchExcessOnOffDays:
      zeroExcessOnLeave && zeroExcessOnAbsent && zeroExcessOnSunday && zeroExcessOnHoliday && zeroExcessOnWeekoff,
    zeroExcessOnLeave,
    zeroExcessOnAbsent,
    zeroExcessOnSunday,
    zeroExcessOnHoliday,
    zeroExcessOnWeekoff,
    countApprovedExtraOnOffDays: boolOr(row.countApprovedExtraOnOffDays, base.countApprovedExtraOnOffDays),
    zeroExcessOnWfhOsp: zeroExcessOnWfh && zeroExcessOnOsp,
    zeroExcessOnWfh,
    zeroExcessOnOsp,
    lateCheckinHalfDayStart: timeOr(row.lateCheckinHalfDayStart, base.lateCheckinHalfDayStart),
    lateCheckinAbsentFrom: timeOr(row.lateCheckinAbsentFrom, base.lateCheckinAbsentFrom),
    lateHalfDayEnabled: boolOr(row.lateHalfDayEnabled, base.lateHalfDayEnabled),
    lateAbsentEnabled: boolOr(row.lateAbsentEnabled, base.lateAbsentEnabled),
    lateRulesForHalftime: boolOr(row.lateRulesForHalftime, base.lateRulesForHalftime),
    separateArticleLateWindow: boolOr(row.separateArticleLateWindow, base.separateArticleLateWindow),
    articleLateCheckinHalfDayStart: timeOr(row.articleLateCheckinHalfDayStart, base.articleLateCheckinHalfDayStart),
    articleLateCheckinAbsentFrom: timeOr(row.articleLateCheckinAbsentFrom, base.articleLateCheckinAbsentFrom),
    fulltimeAutoHalfDayHours: numOr(row.fulltimeAutoHalfDayHours, base.fulltimeAutoHalfDayHours),
    fulltimeAutoHalfDayEnabled: boolOr(row.fulltimeAutoHalfDayEnabled, base.fulltimeAutoHalfDayEnabled),
    fulltimeCapAtSchedule: boolOr(row.fulltimeCapAtSchedule, base.fulltimeCapAtSchedule),
    fulltimeAlsoAfterCheckin: boolOr(row.fulltimeAlsoAfterCheckin, base.fulltimeAlsoAfterCheckin),
    fulltimeAutoHalfDayFrom: timeOr(row.fulltimeAutoHalfDayFrom, base.fulltimeAutoHalfDayFrom),
    articleAutoHalfDayFrom: timeOr(row.articleAutoHalfDayFrom, base.articleAutoHalfDayFrom),
    articleAutoHalfDayByTime: boolOr(row.articleAutoHalfDayByTime, base.articleAutoHalfDayByTime),
    articleAutoHalfDayBelowHours: numOr(row.articleAutoHalfDayBelowHours, base.articleAutoHalfDayBelowHours),
    articleAutoHalfDayByHours: boolOr(row.articleAutoHalfDayByHours, base.articleAutoHalfDayByHours),
    singlePunchIsHalfDay: boolOr(row.singlePunchIsHalfDay, base.singlePunchIsHalfDay),
    internUsesArticleRules: boolOr(row.internUsesArticleRules, base.internUsesArticleRules),
    skipScheduledHalfDay: boolOr(row.skipScheduledHalfDay, base.skipScheduledHalfDay),
  };
}

export function halfDayScheduledShareOf(
  policy?: Pick<AttendanceCalcPolicy, 'halfDayScheduledShare' | 'halfDayUsesHalfSchedule'> | null
): number {
  return shareOr(policy?.halfDayScheduledShare, policy?.halfDayUsesHalfSchedule);
}

/** Minutes from one side of the punch, after the chosen counting style. */
function countedEdgeMinutes(amount: number, style: EdgeCountStyle, graceMinutes: number): number {
  const safe = Math.max(0, amount);
  const grace = Math.max(0, Number.isFinite(graceMinutes) ? graceMinutes : 0);
  if (safe <= 0 || style === 'none') return 0;
  if (style === 'all') return safe;
  if (style === 'all-if-over') return safe > grace ? safe : 0;
  return Math.max(0, safe - grace);
}

function clockEdgeExcessMinutes(
  scheduledInTime: string,
  scheduledOutTime: string,
  inTime: string,
  outTime: string,
  earlyStyle: EdgeCountStyle,
  earlyGrace: number,
  lateStyle: EdgeCountStyle,
  lateGrace: number
): number {
  const [schInH, schInM] = scheduledInTime.split(':').map(Number);
  const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
  const [actInH, actInM] = inTime.split(':').map(Number);
  const [actOutH, actOutM] = outTime.split(':').map(Number);
  const schInMin = schInH * 60 + schInM;
  const schOutMin = schOutH * 60 + schOutM;
  const actInMin = actInH * 60 + actInM;
  const actOutMin = actOutH * 60 + actOutM;
  let excess = 0;
  if (actInMin < schInMin) {
    excess += countedEdgeMinutes(schInMin - actInMin, earlyStyle, earlyGrace);
  }
  if (actOutMin > schOutMin) {
    excess += countedEdgeMinutes(actOutMin - schOutMin, lateStyle, lateGrace);
  }
  return excess;
}

function shortfallHours(shortMinutes: number, style: ShortfallStyle, graceMinutes: number): number {
  if (shortMinutes <= 0 || style === 'none') return 0;
  if (style === 'only-beyond') return -(Math.max(0, shortMinutes - Math.max(0, graceMinutes)) / 60);
  return -(shortMinutes / 60);
}

/**
 * Extra or short hours for one group.
 * Edges are used only when the day is longer than scheduled, matching the original article rule.
 * A shorter day uses the shortfall choice and does not also add early or late minutes.
 */
export function excessHoursForGroup(
  group: 'article' | 'staff',
  policy: AttendanceCalcPolicy,
  scheduledInTime: string,
  scheduledOutTime: string,
  inTime: string,
  outTime: string,
  actualMinutes: number,
  scheduledMinutes: number
): number {
  const rules = policyValues(policy);
  const article = group === 'article';
  const method = article ? rules.articleExcessStyle : rules.staffExcessStyle;
  const shortfall = article ? rules.articleShortfallStyle : rules.staffShortfallStyle;
  const shortfallGrace = article ? rules.articleShortfallGraceMinutes : rules.staffShortfallGraceMinutes;
  const gap = scheduledMinutes - actualMinutes;

  if (method === 'duration') {
    const grace = article ? rules.articleDurationGraceMinutes : rules.staffGraceMinutes;
    const graceStyle = article ? rules.articleDurationGraceStyle : rules.staffGraceStyle;
    const diff = actualMinutes - scheduledMinutes;
    if (diff < 0) {
      if (shortfall === 'none') return 0;
      if (shortfall === 'only-beyond') return -(Math.max(0, -diff - shortfallGrace) / 60);
      const short = -diff;
      if (graceStyle === 'only-beyond') return -(Math.max(0, short - grace) / 60);
      return short <= grace ? 0 : -(short / 60);
    }
    if (diff === 0) return 0;
    if (graceStyle === 'only-beyond') return Math.max(0, diff - grace) / 60;
    return diff <= grace ? 0 : diff / 60;
  }

  if (gap > 0) return shortfallHours(gap, shortfall, shortfallGrace);
  if (gap === 0) return 0;
  const minutes = clockEdgeExcessMinutes(
    scheduledInTime,
    scheduledOutTime,
    inTime,
    outTime,
    article ? rules.articleEarlyInStyle : rules.staffEarlyInStyle,
    article ? rules.articleEarlyInGraceMinutes : rules.staffEarlyInGraceMinutes,
    article ? rules.articleLateOutStyle : rules.staffLateOutStyle,
    article ? rules.articleLateOutGraceMinutes : rules.staffLateOutGraceMinutes
  );
  return minutes > 0 ? minutes / 60 : 0;
}

/** Latest saved version on or before the date. Otherwise the original built-in numbers. */
export function resolveAttendanceCalcPolicy(
  versions: AttendanceCalcPolicyVersion[] | null | undefined,
  date: string | Date | null | undefined
): AttendanceCalcPolicy {
  const dateKey = toAttendanceDateKey(date);
  let best: AttendanceCalcPolicyVersion | null = null;
  let bestFrom = '';
  for (const version of versions || []) {
    const from = toAttendanceDateKey(version.effectiveFrom);
    if (!from || !dateKey || from > dateKey) continue;
    if (from > bestFrom) {
      best = version;
      bestFrom = from;
    }
  }
  if (!best) return { ...BUILTIN_ATTENDANCE_CALC_POLICY };
  return policyValues(best);
}

/** Policy for a date. Uses an explicit list, or the list loaded for this process. */
export function policyForDate(
  date: string | Date | null | undefined,
  versions?: AttendanceCalcPolicyVersion[] | null
): AttendanceCalcPolicy {
  const list = versions === undefined ? runtimeVersions : versions;
  return resolveAttendanceCalcPolicy(list, date);
}

function clockLabel(hm: string): string {
  const match = String(hm || '').match(TIME_RE);
  if (!match) return hm;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  if (m === 0) return `${hr}:00 ${suffix}`;
  return `${hr}:${String(m).padStart(2, '0')} ${suffix}`;
}

export type PolicySentenceGroups = {
  extra: string[];
  late: string[];
  half: string[];
};

function edgeSentence(who: string, side: string, style: EdgeCountStyle, grace: number): string {
  if (style === 'none') return `${who}: ${side} does not count.`;
  if (style === 'all') return `${who}: every minute of ${side} counts.`;
  if (style === 'only-beyond') {
    return `${who}: ${side} counts only for the minutes past ${grace}.`;
  }
  return grace <= 0
    ? `${who}: ${side} counts from the first minute, and all of those minutes count.`
    : `${who}: ${side} counts only when it is more than ${grace} minutes, and then all of those minutes count.`;
}

function shortfallSentence(who: string, style: ShortfallStyle, grace: number): string {
  if (style === 'none') return `${who}: a short day does not count.`;
  if (style === 'only-beyond') return `${who}: a short day counts only for the minutes past ${grace}.`;
  return `${who}: a short day counts in full.`;
}

function shareSentence(share: number): string {
  if (share <= 0) return 'A half day has no scheduled hours.';
  if (share >= 0.999) return 'A half day uses the full scheduled hours.';
  if (Math.abs(share - 0.5) < 0.001) return 'A half day uses half of that day’s scheduled hours.';
  if (Math.abs(share - 0.75) < 0.001) return 'A half day uses three quarters of that day’s scheduled hours.';
  return `A half day uses ${Math.round(share * 100)}% of that day’s scheduled hours.`;
}

export function describeAttendanceCalcPolicy(policy: AttendanceCalcPolicy): PolicySentenceGroups {
  const rules = policyValues(policy);
  const articleCompare =
    rules.articleExcessStyle === 'duration'
      ? rules.articleDurationGraceMinutes <= 0
        ? 'Articles: extra or short is worked time minus scheduled time. Every minute counts.'
        : rules.articleDurationGraceStyle === 'only-beyond'
          ? `Articles: differences within ${rules.articleDurationGraceMinutes} minutes count as zero. Only the minutes past that grace count.`
          : `Articles: differences within ${rules.articleDurationGraceMinutes} minutes count as zero. A larger difference counts in full.`
      : 'Articles: early arrival and late leaving are counted separately.';
  const staffCompare =
    rules.staffExcessStyle === 'edges'
      ? 'Staff: early arrival and late leaving are counted separately.'
      : rules.staffGraceMinutes <= 0
        ? 'Staff: extra or short is worked time minus scheduled time. Every minute counts.'
        : rules.staffGraceStyle === 'only-beyond'
          ? `Staff: differences within ${rules.staffGraceMinutes} minutes count as zero. Only the minutes past that grace count.`
          : `Staff: differences within ${rules.staffGraceMinutes} minutes count as zero. A larger difference counts in full.`;

  const off = [
    rules.zeroExcessOnLeave ? 'Leave has no extra or short.' : 'Leave can have extra or short.',
    rules.zeroExcessOnAbsent ? 'Absent has no extra or short.' : 'Absent can have extra or short.',
    rules.zeroExcessOnSunday ? 'Sunday has no punch extra or short.' : 'Sunday can have punch extra or short.',
    rules.zeroExcessOnHoliday ? 'A holiday has no punch extra or short.' : 'A holiday can have punch extra or short.',
    rules.zeroExcessOnWeekoff ? 'A week off has no punch extra or short.' : 'A week off can have punch extra or short.',
    rules.countApprovedExtraOnOffDays
      ? 'Approved extra work still counts on Sunday, holiday, and week off.'
      : 'Approved extra work does not count on Sunday, holiday, and week off.',
    rules.zeroExcessOnWfh
      ? 'Work from home has no hour extra or short.'
      : 'Work from home can have hour extra or short.',
    rules.zeroExcessOnOsp
      ? 'Outstation has no hour extra or short.'
      : 'Outstation can have hour extra or short.',
  ];

  const lateWindow = (start: string, absent: string) => {
    if (rules.lateHalfDayEnabled && rules.lateAbsentEnabled) {
      return `Check-in from ${clockLabel(start)} until ${clockLabel(absent)} marks a half day. At or after ${clockLabel(absent)} marks the day absent.`;
    }
    if (rules.lateHalfDayEnabled) {
      return `Check-in from ${clockLabel(start)} until ${clockLabel(absent)} marks a half day.`;
    }
    if (rules.lateAbsentEnabled) {
      return `Check-in at or after ${clockLabel(absent)} marks the day absent.`;
    }
    return 'A late check-in does not change the day.';
  };

  const fulltimeBits = [
    rules.fulltimeAutoHalfDayEnabled
      ? `Full-time: half day when worked hours are below ${rules.fulltimeAutoHalfDayHours}${rules.fulltimeCapAtSchedule ? ', and never above that day’s own schedule' : ''}.`
      : 'Full-time: worked hours do not mark a half day.',
    rules.fulltimeAlsoAfterCheckin
      ? `Full-time: check-in at or after ${clockLabel(rules.fulltimeAutoHalfDayFrom)} also marks a half day.`
      : 'Full-time: check-in time alone does not mark a half day.',
  ];
  const articleBits = [
    rules.articleAutoHalfDayByTime
      ? `Articles: check-in at or after ${clockLabel(rules.articleAutoHalfDayFrom)} marks a half day.`
      : 'Articles: check-in time alone does not mark a half day.',
    rules.articleAutoHalfDayByHours
      ? `Articles: worked hours below ${rules.articleAutoHalfDayBelowHours} mark a half day.`
      : 'Articles: short hours do not mark a half day.',
  ];

  return {
    extra: [
      articleCompare,
      rules.articleExcessStyle === 'edges'
        ? edgeSentence('Articles', 'coming in early', rules.articleEarlyInStyle, rules.articleEarlyInGraceMinutes)
        : '',
      rules.articleExcessStyle === 'edges'
        ? edgeSentence('Articles', 'leaving late', rules.articleLateOutStyle, rules.articleLateOutGraceMinutes)
        : '',
      shortfallSentence('Articles', rules.articleShortfallStyle, rules.articleShortfallGraceMinutes),
      staffCompare,
      rules.staffExcessStyle === 'edges'
        ? edgeSentence('Staff', 'coming in early', rules.staffEarlyInStyle, rules.staffEarlyInGraceMinutes)
        : '',
      rules.staffExcessStyle === 'edges'
        ? edgeSentence('Staff', 'leaving late', rules.staffLateOutStyle, rules.staffLateOutGraceMinutes)
        : '',
      shortfallSentence('Staff', rules.staffShortfallStyle, rules.staffShortfallGraceMinutes),
      shareSentence(rules.halfDayScheduledShare),
      rules.internUsesArticleRules ? 'Interns follow the article rules.' : 'Interns follow the staff rules.',
      ...off,
    ].filter(Boolean),
    late: [
      lateWindow(rules.lateCheckinHalfDayStart, rules.lateCheckinAbsentFrom),
      rules.separateArticleLateWindow
        ? `Articles use their own window. ${lateWindow(rules.articleLateCheckinHalfDayStart, rules.articleLateCheckinAbsentFrom)}`
        : 'Articles use the same late check-in times as everyone else.',
      rules.lateRulesForHalftime
        ? 'Half-time employees are included.'
        : 'Half-time employees are not included.',
    ],
    half: [
      ...fulltimeBits,
      ...articleBits,
      rules.singlePunchIsHalfDay
        ? 'One punch, with the other missing, marks a half day.'
        : 'One punch does not mark a half day by itself.',
      rules.skipScheduledHalfDay
        ? 'A day the schedule already marks as a half day is left alone.'
        : 'Hour rules also apply on days the schedule already marks as a half day.',
    ],
  };
}

const FIELD_LABEL: Record<keyof AttendanceCalcPolicy, string> = {
  articleEarlyInCounts: 'Article early arrival',
  articleExcessStyle: 'Article comparison',
  articleEarlyInStyle: 'Article early arrival style',
  articleEarlyInGraceMinutes: 'Article early grace',
  articleLateOutStyle: 'Article late leaving style',
  articleLateOutGraceMinutes: 'Article late-out grace',
  articleShortfallStyle: 'Article short day',
  articleShortfallGraceMinutes: 'Article short-day grace',
  articleDurationGraceMinutes: 'Article duration grace',
  articleDurationGraceStyle: 'Article duration grace style',
  staffGraceMinutes: 'Staff grace',
  staffExcessStyle: 'Staff comparison',
  staffGraceStyle: 'Staff grace style',
  staffEarlyInStyle: 'Staff early arrival style',
  staffEarlyInGraceMinutes: 'Staff early grace',
  staffLateOutStyle: 'Staff late leaving style',
  staffLateOutGraceMinutes: 'Staff late-out grace',
  staffShortfallStyle: 'Staff short day',
  staffShortfallGraceMinutes: 'Staff short-day grace',
  halfDayUsesHalfSchedule: 'Half-day schedule',
  halfDayScheduledShare: 'Half-day scheduled share',
  zeroPunchExcessOnOffDays: 'Off-day extra and short',
  zeroExcessOnLeave: 'Leave extra and short',
  zeroExcessOnAbsent: 'Absent extra and short',
  zeroExcessOnSunday: 'Sunday extra and short',
  zeroExcessOnHoliday: 'Holiday extra and short',
  zeroExcessOnWeekoff: 'Week off extra and short',
  countApprovedExtraOnOffDays: 'Extra work on off days',
  zeroExcessOnWfhOsp: 'WFH and outstation extra and short',
  zeroExcessOnWfh: 'WFH extra and short',
  zeroExcessOnOsp: 'Outstation extra and short',
  lateCheckinHalfDayStart: 'Late half-day from',
  lateCheckinAbsentFrom: 'Absent from',
  lateHalfDayEnabled: 'Late half day',
  lateAbsentEnabled: 'Late absent',
  lateRulesForHalftime: 'Half-time late rules',
  separateArticleLateWindow: 'Article late window',
  articleLateCheckinHalfDayStart: 'Article late half-day from',
  articleLateCheckinAbsentFrom: 'Article absent from',
  fulltimeAutoHalfDayHours: 'Full-time auto half day',
  fulltimeAutoHalfDayEnabled: 'Full-time hour half day',
  fulltimeCapAtSchedule: 'Full-time schedule cap',
  fulltimeAlsoAfterCheckin: 'Full-time check-in half day',
  fulltimeAutoHalfDayFrom: 'Full-time check-in from',
  articleAutoHalfDayFrom: 'Article auto half day from',
  articleAutoHalfDayByTime: 'Article check-in half day',
  articleAutoHalfDayBelowHours: 'Article auto half day below',
  articleAutoHalfDayByHours: 'Article hour half day',
  singlePunchIsHalfDay: 'Single punch half day',
  internUsesArticleRules: 'Interns follow articles',
  skipScheduledHalfDay: 'Scheduled half days',
};

function fieldText(key: keyof AttendanceCalcPolicy, policy: AttendanceCalcPolicy): string {
  switch (key) {
    case 'articleEarlyInCounts':
      return policy.articleEarlyInCounts ? 'counts as extra' : 'does not count';
    case 'articleLateOutGraceMinutes':
      return `${policy.articleLateOutGraceMinutes} minutes`;
    case 'staffGraceMinutes':
      return `${policy.staffGraceMinutes} minutes`;
    case 'halfDayUsesHalfSchedule':
      return policy.halfDayUsesHalfSchedule ? 'uses half the scheduled hours' : 'uses the full scheduled hours';
    case 'zeroPunchExcessOnOffDays':
      return policy.zeroPunchExcessOnOffDays ? 'no punch extra or short' : 'punch extra and short can apply';
    case 'zeroExcessOnWfhOsp':
      return policy.zeroExcessOnWfhOsp ? 'no hour extra or short' : 'hour extra and short can apply';
    case 'lateCheckinHalfDayStart':
      return clockLabel(policy.lateCheckinHalfDayStart);
    case 'lateCheckinAbsentFrom':
      return clockLabel(policy.lateCheckinAbsentFrom);
    case 'fulltimeAutoHalfDayHours':
      return `below ${policy.fulltimeAutoHalfDayHours} hours`;
    case 'articleAutoHalfDayFrom':
      return clockLabel(policy.articleAutoHalfDayFrom);
    case 'articleAutoHalfDayBelowHours':
      return `below ${policy.articleAutoHalfDayBelowHours} hours`;
    case 'skipScheduledHalfDay':
      return policy.skipScheduledHalfDay ? 'left alone' : 'hour rules still apply';
    case 'halfDayScheduledShare':
      return shareSentence(policy.halfDayScheduledShare);
    default:
      if (typeof policy[key] === 'boolean') return policy[key] ? 'on' : 'off';
      return String(policy[key] ?? '');
  }
}

/** Plain lines describing what is different from the previous version. */
export function policyChanges(
  next: AttendanceCalcPolicy,
  previous: AttendanceCalcPolicy
): string[] {
  const lines: string[] = [];
  (Object.keys(FIELD_LABEL) as (keyof AttendanceCalcPolicy)[]).forEach((key) => {
    if (next[key] === previous[key]) return;
    lines.push(`${FIELD_LABEL[key]}: ${fieldText(key, previous)} → ${fieldText(key, next)}`);
  });
  return lines;
}

export type PolicyVersionStatus = 'in-use' | 'scheduled' | 'earlier';

export function policyVersionStatus(
  effectiveFrom: string,
  versions: AttendanceCalcPolicyVersion[],
  today: string
): PolicyVersionStatus {
  const from = toAttendanceDateKey(effectiveFrom);
  if (from && today && from > today) return 'scheduled';
  const inUse = resolveInUseVersion(versions, today);
  if (inUse && toAttendanceDateKey(inUse.effectiveFrom) === from) return 'in-use';
  return 'earlier';
}

export function resolveInUseVersion(
  versions: AttendanceCalcPolicyVersion[] | null | undefined,
  today: string
): AttendanceCalcPolicyVersion | null {
  const todayKey = toAttendanceDateKey(today);
  let best: AttendanceCalcPolicyVersion | null = null;
  let bestFrom = '';
  for (const version of versions || []) {
    const from = toAttendanceDateKey(version.effectiveFrom);
    if (!from || !todayKey || from > todayKey) continue;
    if (from > bestFrom) {
      best = version;
      bestFrom = from;
    }
  }
  return best;
}

function readBool(raw: Record<string, unknown>, key: keyof AttendanceCalcPolicy): boolean | null {
  const value = raw[key];
  if (typeof value === 'boolean') return value;
  return null;
}

function readNumber(
  raw: Record<string, unknown>,
  key: keyof AttendanceCalcPolicy,
  min: number,
  max: number
): number | null {
  const value = Number(raw[key]);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 1000) / 1000;
}

function readTime(raw: Record<string, unknown>, key: keyof AttendanceCalcPolicy): string | null {
  const value = String(raw[key] || '').trim();
  return TIME_RE.test(value) ? value : null;
}

export function sanitizeAttendanceCalcPolicy(
  body: unknown
): { ok: true; policy: AttendanceCalcPolicy; effectiveFrom: string } | { ok: false; error: string } {
  const raw = (body || {}) as Record<string, unknown>;
  const effectiveFrom = toAttendanceDateKey(String(raw.effectiveFrom || ''));
  if (!effectiveFrom) return { ok: false, error: 'Effective date is required' };

  const articleEarlyInCounts = readBool(raw, 'articleEarlyInCounts') ?? true;
  const halfDayUsesHalfSchedule = readBool(raw, 'halfDayUsesHalfSchedule') ?? true;
  const zeroPunchExcessOnOffDays = readBool(raw, 'zeroPunchExcessOnOffDays') ?? true;
  const zeroExcessOnWfhOsp = readBool(raw, 'zeroExcessOnWfhOsp') ?? true;
  const skipScheduledHalfDay = readBool(raw, 'skipScheduledHalfDay') ?? true;

  const graceKeys = [
    'articleEarlyInGraceMinutes',
    'articleLateOutGraceMinutes',
    'articleShortfallGraceMinutes',
    'articleDurationGraceMinutes',
    'staffGraceMinutes',
    'staffEarlyInGraceMinutes',
    'staffLateOutGraceMinutes',
    'staffShortfallGraceMinutes',
  ] as const;
  for (const key of graceKeys) {
    if (raw[key] != null && raw[key] !== '' && readNumber(raw, key, 0, 720) == null) {
      return { ok: false, error: 'Grace minutes must be between 0 and 720' };
    }
  }
  if (readNumber(raw, 'fulltimeAutoHalfDayHours', 0, 24) == null) {
    return { ok: false, error: 'Hour limits must be between 0 and 24' };
  }
  if (readNumber(raw, 'articleAutoHalfDayBelowHours', 0, 24) == null) {
    return { ok: false, error: 'Hour limits must be between 0 and 24' };
  }
  const share = Number(raw.halfDayScheduledShare);
  if (raw.halfDayScheduledShare != null && raw.halfDayScheduledShare !== '' && (!Number.isFinite(share) || share < 0 || share > 1)) {
    return { ok: false, error: 'Half-day share must be between 0 and 1' };
  }

  const lateCheckinHalfDayStart = readTime(raw, 'lateCheckinHalfDayStart');
  const lateCheckinAbsentFrom = readTime(raw, 'lateCheckinAbsentFrom');
  const articleAutoHalfDayFrom = readTime(raw, 'articleAutoHalfDayFrom');
  const articleLateStart = readTime(raw, 'articleLateCheckinHalfDayStart') || lateCheckinHalfDayStart;
  const articleLateAbsent = readTime(raw, 'articleLateCheckinAbsentFrom') || lateCheckinAbsentFrom;
  const fulltimeFrom = readTime(raw, 'fulltimeAutoHalfDayFrom') || '13:00';
  if (!lateCheckinHalfDayStart || !lateCheckinAbsentFrom || !articleAutoHalfDayFrom || !articleLateStart || !articleLateAbsent) {
    return { ok: false, error: 'Enter times as HH:MM' };
  }
  if (lateCheckinAbsentFrom <= lateCheckinHalfDayStart || articleLateAbsent <= articleLateStart) {
    return { ok: false, error: 'Absent time must be later than the half-day start' };
  }

  const policy = policyValues({
    ...(raw as Partial<AttendanceCalcPolicy>),
    articleEarlyInCounts,
    halfDayUsesHalfSchedule,
    zeroPunchExcessOnOffDays,
    zeroExcessOnWfhOsp,
    skipScheduledHalfDay,
    lateCheckinHalfDayStart,
    lateCheckinAbsentFrom,
    articleAutoHalfDayFrom,
    articleLateCheckinHalfDayStart: articleLateStart,
    articleLateCheckinAbsentFrom: articleLateAbsent,
    fulltimeAutoHalfDayFrom: fulltimeFrom,
    fulltimeAutoHalfDayHours: readNumber(raw, 'fulltimeAutoHalfDayHours', 0, 24) ?? 6,
    articleAutoHalfDayBelowHours: readNumber(raw, 'articleAutoHalfDayBelowHours', 0, 24) ?? 3.5,
  });

  return { ok: true, effectiveFrom, policy };
}

/** Browser load for Summary and Daywise. A failed load leaves the original numbers in place. */
export async function loadAttendanceCalcPoliciesForClient(): Promise<AttendanceCalcPolicyVersion[]> {
  if (typeof window === 'undefined') return runtimeVersions ?? [];
  try {
    const res = await fetch('/api/hr-console-settings/attendance-calc', hrCredentialsInit());
    const json = await res.json();
    if (res.ok && json?.success && Array.isArray(json.data?.versions)) {
      const versions = json.data.versions as AttendanceCalcPolicyVersion[];
      setRuntimeAttendanceCalcPolicies(versions);
      return versions;
    }
  } catch {
    // Keep whatever was already loaded, or the original numbers.
  }
  return runtimeVersions ?? [];
}
