import { api, getAuth, setAuth, onAuthRefresh } from './api';

const response = (status, body) => ({ status, ok: status >= 200 && status < 300,
  statusText: 'test', json: async () => body });

beforeEach(() => {
  global.fetch = jest.fn();
  setAuth({ token: 'old-access', refreshToken: 'old-refresh', deviceId: 'device' });
  onAuthRefresh(null);
});

test('saves rotated refresh token and retries with the new access token', async () => {
  const callback = jest.fn();
  onAuthRefresh(callback);
  fetch.mockResolvedValueOnce(response(401, {}))
    .mockResolvedValueOnce(response(200, { access_token: 'new-access', refresh_token: 'new-refresh' }))
    .mockResolvedValueOnce(response(200, { user: { id: 1 } }));
  expect(await api.me()).toEqual({ user: { id: 1 } });
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer old-refresh');
  expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer new-access');
  expect(getAuth().refreshToken).toBe('new-refresh');
  expect(callback).toHaveBeenCalledWith('new-access', 'new-refresh');
});

test('guest resume and account upgrade carry proof of ownership', async () => {
  fetch.mockResolvedValue(response(200, {}));
  await api.session({ deviceId: 'device' });
  await api.register({ nickname: 'person' });
  for (const [, options] of fetch.mock.calls) {
    expect(options.headers.Authorization).toBe('Bearer old-access');
  }
});
