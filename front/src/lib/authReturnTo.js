// Only invitations may resume after authentication. Never accept arbitrary URLs.
export function guestReturnTo(search) {
  const path = new URLSearchParams(search).get('returnTo');
  return typeof path === 'string' && path === path.trim() && /^\/g\/[A-Za-z0-9_-]+$/.test(path) ? path : null;
}
