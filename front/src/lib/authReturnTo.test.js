import { guestReturnTo } from './authReturnTo';

test.each(['/g/PARK18', '/g/abc_123-XYZ'])('accepts invitation return path %s', (path) => {
  expect(guestReturnTo(`?returnTo=${encodeURIComponent(path)}`)).toBe(path);
});

test.each([
  'https://evil.example', '//evil.example', '/admin', '/g/../admin',
  '/g/code?next=https://evil.example', '/g/code#anchor', '/g/code/path',
  '/g/code\\evil', '/g/%2f%2fevil.example', '/g/code\n', '',
])('rejects return path %s', (path) => {
  expect(guestReturnTo(`?returnTo=${encodeURIComponent(path)}`)).toBeNull();
});
