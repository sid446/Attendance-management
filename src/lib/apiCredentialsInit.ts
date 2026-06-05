/** Send HttpOnly session cookies on same-origin API calls (HR and employee). */
export function apiCredentialsInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: 'include',
  };
}
