export const EXCLUDED_COLUMNS = [
  'Leaves B/F',
  'Credits for Articles (as on 1st Jan 26)',
  'Weekly Scheduled Hours',
  'Scheduled Daily Hours (Sat)',
  'Work Timings (Sat)',
  'Scheduled Daily Hours (Mon to Fri)',
  'Work Timings (Mon to Fri)',
];

export const BASIC_MASTER_WORKFLOW_STEPS = ['Mode & effective date', 'Choose Excel', 'Review result'] as const;

export const SCHEDULE_UPLOAD_WORKFLOW_STEPS = ['Schedule effective date', 'Choose Excel', 'Review result'] as const;
