import { useSessionStore } from './useSessionStore';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: { register: jest.fn(), updateMe: jest.fn(), session: jest.fn(), me: jest.fn() },
  setAuth: jest.fn(), onAuthRefresh: jest.fn(),
}));

const initialState = useSessionStore.getState();
const payload = {
  identifier: 'ivan@example.kz', password: 'password1', full_name: 'Иванов Иван',
  role: 'org', phone: '+7 700 000 00 00', cityId: 'almaty', interests: ['eco'],
  legal: { version: 'active-version', termsAccepted: true, privacyAccepted: true, consentAccepted: true, adultConfirmed: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  useSessionStore.setState({ ...initialState, name: null, token: null, loggedIn: false, booted: false });
});

test('forwards registration and confirmations atomically and respects the returned role', async () => {
  api.register.mockResolvedValue({ access_token: 'token', refresh_token: 'refresh', user: { full_name: payload.full_name, role: 'vol', user_type: 'user' } });
  await useSessionStore.getState().registerAccount(payload);
  expect(api.register).toHaveBeenCalledWith(expect.objectContaining(payload));
  expect(api.updateMe).not.toHaveBeenCalled();
  expect(useSessionStore.getState()).toMatchObject({ name: 'Иванов Иван', role: 'vol', token: 'token', loggedIn: true });
  expect(localStorage.getItem('erik-session')).not.toContain('password1');
});

test('does not persist form identity or create a fallback session when registration fails', async () => {
  api.register.mockRejectedValue(new Error('Registration failed'));
  await expect(useSessionStore.getState().registerAccount(payload)).rejects.toThrow('Registration failed');
  expect(useSessionStore.getState()).toMatchObject({ name: null, token: null, loggedIn: false });
  expect(api.session).not.toHaveBeenCalled();
  expect(localStorage.getItem('erik-session')).not.toContain('password1');
  expect(localStorage.getItem('erik-session')).not.toContain('Иванов');
});

test('visiting public pages does not create an anonymous user', async () => {
  await useSessionStore.getState().boot();
  expect(api.session).not.toHaveBeenCalled();
  expect(useSessionStore.getState()).toMatchObject({ loggedIn: false, booted: true, token: null });
});

test('an invalid saved token does not create a replacement device user', async () => {
  useSessionStore.setState({ token: 'invalid', name: 'Иванов Иван', loggedIn: true });
  api.me.mockRejectedValue({ status: 401 });
  await useSessionStore.getState().boot();
  expect(api.session).not.toHaveBeenCalled();
  expect(useSessionStore.getState()).toMatchObject({ name: null, token: null, loggedIn: false, booted: true });
});

test('legacy device restoration never submits a stored name as a new profile', async () => {
  useSessionStore.setState({ name: 'Old local draft', role: 'org', roleDirty: true });
  api.session.mockResolvedValue({ token: 'guest', user: { full_name: null, role: 'vol' } });
  await useSessionStore.getState().boot();
  expect(api.session).toHaveBeenCalledWith({ deviceId: useSessionStore.getState().deviceId });
  expect(useSessionStore.getState()).toMatchObject({ name: null, loggedIn: false });
});
