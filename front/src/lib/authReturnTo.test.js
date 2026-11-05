import { guestReturnTo } from './authReturnTo';

test('resumes university enrollment after authentication', () => {
  expect(guestReturnTo('?returnTo=%2Funiversities%2F5')).toBe('/universities/5');
  expect(guestReturnTo('?returnTo=%2Funiversities%2F5%2F..%2Fadmin')).toBeNull();
});

test.each(['/manage/org', '/g/PARK18', '/g/abc_123-XYZ', '/attendance/12#eyJ.TEST_token-signature'])('accepts invitation return path %s', (path) => {
  expect(guestReturnTo(`?returnTo=${encodeURIComponent(path)}`)).toBe(path);
});

test.each([
  'https://evil.example', '//evil.example', '/admin', '/g/../admin',
  '/attendance/1#https://evil.example', '/attendance/../admin#token', '/attendance/1#token?next=evil',
  '/g/code?next=https://evil.example', '/g/code#anchor', '/g/code/path',
  '/g/code\\evil', '/g/%2f%2fevil.example', '/g/code\n', '',
])('rejects return path %s', (path) => {
  expect(guestReturnTo(`?returnTo=${encodeURIComponent(path)}`)).toBeNull();
});
