/** Shared daywise export column keys + header labels (portal + human sheet compare). */

export const DAYWISE_COLUMN_KEYS = [
  'employeeCode',
  'weekType',
  'source',
  'date',
  'day',
  'employeeName',
  'designation',
  'verticalHead',
  'presentAbsent',
  'actualInTimeOriginal',
  'actualOutTimeOriginal',
  'actualInTimeEditable',
  'actualOutTimeEditable',
  'extraWorkTimes',
  'punchWorkingHrs',
  'extraWorkHrs',
  'trueFalseInTime',
  'trueFalseOutTime',
  'scheduledInTime',
  'scheduledOutTime',
  'maxWFH',
  'actualWFH',
  'maxOutstation',
  'actualOutstation',
  'workingHrs',
  'scheduledTime',
  'scheduledHrsMonth',
  'workingHrsMonth',
  'excessHrsMonth',
  'deficitHrsMonth',
  'excessHrsDay',
  'deficitHrsDay',
  'halfDays',
] as const;

export type DaywiseColumnKey = (typeof DAYWISE_COLUMN_KEYS)[number];

export const DAYWISE_HEADER_LABELS: readonly string[] = [
  'Employee Code',
  'Weekday / weekoff',
  'Source',
  'Date',
  'Day',
  'Employee name',
  'Designation',
  'Vertical Head',
  'Present / absent',
  'Actual in (original)',
  'Actual out (original)',
  'Actual in (edited)',
  'Actual out (edited)',
  'Extra work (times)',
  'Working hrs (punch)',
  'Extra work hrs',
  'In time unchanged',
  'Out time unchanged',
  'Scheduled in',
  'Scheduled out',
  'Max WFH',
  'Actual WFH',
  'Max outstation (1.2 d)',
  'Actual outstation',
  'Working hrs (day)',
  'Scheduled (day)',
  'Scheduled hrs (month)',
  'Working hrs (month)',
  'Excess (month)',
  'Deficit (month)',
  'Excess (day)',
  'Deficit (day)',
  'Half day',
];

/** Columns compared when diffing portal vs human daywise sheets. */
export const DAYWISE_COMPARE_KEYS: readonly DaywiseColumnKey[] = [
  'weekType',
  'presentAbsent',
  'actualInTimeOriginal',
  'actualOutTimeOriginal',
  'actualInTimeEditable',
  'actualOutTimeEditable',
  'extraWorkTimes',
  'punchWorkingHrs',
  'extraWorkHrs',
  'trueFalseInTime',
  'trueFalseOutTime',
  'scheduledInTime',
  'scheduledOutTime',
  'maxWFH',
  'actualWFH',
  'maxOutstation',
  'actualOutstation',
  'workingHrs',
  'scheduledTime',
  'scheduledHrsMonth',
  'workingHrsMonth',
  'excessHrsMonth',
  'deficitHrsMonth',
  'excessHrsDay',
  'deficitHrsDay',
  'halfDays',
];

export const DAYWISE_COMPARE_LABEL: Record<DaywiseColumnKey, string> = Object.fromEntries(
  DAYWISE_COLUMN_KEYS.map((key, i) => [key, DAYWISE_HEADER_LABELS[i]])
) as Record<DaywiseColumnKey, string>;

export type DaywisePlainRow = Partial<Record<DaywiseColumnKey, string>> & {
  employeeCode: string;
  date: string;
  employeeName?: string;
};
