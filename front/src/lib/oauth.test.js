import { readGoogleLogin } from './oauth';

const verifier = 'v'.repeat(43), code = 'c'.repeat(43);
beforeEach(() => sessionStorage.clear());
test('callback can resume after a reload without leaving the code in the URL', () => {
  sessionStorage.setItem('erik-google-login', JSON.stringify({ verifier, createdAt: Date.now(), returnTo: '/g/INVITE' }));
  expect(readGoogleLogin('#code=' + code)).toMatchObject({ code, verifier, returnTo: '/g/INVITE' });
  expect(readGoogleLogin('')).toMatchObject({ code, verifier });
});
test('rejects foreign return destinations and stale browser sessions', () => {
  sessionStorage.setItem('erik-google-login', JSON.stringify({ verifier, createdAt: Date.now(), returnTo: 'https://evil.example/' }));
  expect(readGoogleLogin('#code=' + code).returnTo).toBeNull();
  sessionStorage.setItem('erik-google-login', JSON.stringify({ verifier, createdAt: Date.now() - 21 * 60 * 1000 }));
  expect(readGoogleLogin('#code=' + code)).toBeNull();
});
test('denied Google authorization cannot resume an earlier handoff', () => {
  sessionStorage.setItem('erik-google-login', JSON.stringify({ verifier, code, createdAt: Date.now() }));
  expect(readGoogleLogin('#error=authorization_failed')).toBeNull();
  expect(sessionStorage.getItem('erik-google-login')).toBeNull();
});
