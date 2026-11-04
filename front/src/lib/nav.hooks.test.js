import { act, renderHook } from '@testing-library/react';
import { useGuardedNav } from './nav';
import { api } from './api';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';

const mockNavigate = jest.fn();
const mockToast = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('./api', () => ({
  api: { me: jest.fn() }, setAuth: jest.fn(), onAuthRefresh: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  useSessionStore.setState({ loggedIn: true, role: 'vol', token: 'account', userType: 'user', lang: 'ru' });
  useUiStore.setState({ showToast: mockToast });
});

afterEach(() => { jest.restoreAllMocks(); });

test.each(['coord', 'org'])('rechecks a cached volunteer role and lets %s open event creation', async (role) => {
  api.me.mockResolvedValue({ user: { role } });
  const { result } = renderHook(() => useGuardedNav());
  await act(async () => { await result.current('/new', 'new'); });
  expect(api.me).toHaveBeenCalledTimes(1);
  expect(useSessionStore.getState().role).toBe(role);
  expect(mockNavigate).toHaveBeenCalledWith('/new');
  expect(mockToast).not.toHaveBeenCalled();
});

test('still refuses a volunteer after checking with the server', async () => {
  api.me.mockResolvedValue({ user: { role: 'vol' } });
  const { result } = renderHook(() => useGuardedNav());
  await act(async () => { await result.current('/new', 'new'); });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test('does not navigate after logout while checking the role', async () => {
  api.me.mockImplementation(async () => {
    useSessionStore.setState({ loggedIn: false, token: null });
    return { user: { role: 'coord' } };
  });
  const { result } = renderHook(() => useGuardedNav());
  await act(async () => { await result.current('/new', 'new'); });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(useSessionStore.getState().role).toBe('vol');
});
