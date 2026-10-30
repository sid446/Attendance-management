export const USERS_LIST_ENDPOINT = '/api/users?listOnly=1&includeInactive=1';

/** Shown under edit/add titles; matches roster “numbered chips” pattern. */
export const EDIT_EMPLOYEE_WORKFLOW_STEPS = ['Choose tab', 'Update fields', 'Save changes'] as const;

export const ADD_EMPLOYEE_WORKFLOW_STEPS = ['Basic details', 'Schedule if needed', 'Create employee'] as const;
