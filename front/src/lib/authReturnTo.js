// Allowlisted local destinations may resume after authentication.
export function guestReturnTo(search) {
  const path = new URLSearchParams(search).get('returnTo');
  return typeof path === 'string' && path.length <= 1100 && path === path.trim()
    && (path === '/manage/org' || /^\/universities\/[1-9]\d*$/.test(path) || /^\/g\/[A-Za-z0-9_-]+$/.test(path) || /^\/attendance\/[1-9]\d*#[A-Za-z0-9_.-]+$/.test(path)) ? path : null;
}
