/**
 * Employee portal fetch helper — sends the HttpOnly session cookie on same-origin API calls.
 */
export function employeeCredentialsInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: 'include',
  };
}
