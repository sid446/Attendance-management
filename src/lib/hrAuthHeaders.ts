/**
 * HR console calls the same-origin `/api/*` routes using an HttpOnly cookie session.
 * Always merge this into `fetch` options so the browser sends the cookie.
 */
export function hrCredentialsInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: 'include',
  };
}

/**
 * @deprecated HR auth uses an HttpOnly cookie; scripts cannot read the token.
 * Prefer `hrCredentialsInit` on every HR `fetch`. Kept empty for any legacy spreads.
 */
export function hrAuthHeaders(): HeadersInit {
  return {};
}
