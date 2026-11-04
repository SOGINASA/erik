import { usePlatformStore } from './usePlatformStore';
import { api } from '../lib/api';
import { useSessionStore } from './useSessionStore';

jest.mock('../lib/api', () => ({
  api: {
    getCities: jest.fn(), getOrgs: jest.fn(), getEvents: jest.fn(),
    leaderboardVolunteers: jest.fn(), getBadges: jest.fn(), getCharity: jest.fn(), userMe: jest.fn(),
  },
  setAuth: jest.fn(), onAuthRefresh: jest.fn(),
}));

test('initial platform state contains no synthetic people or activity', () => {
  const state = usePlatformStore.getInitialState();
  expect(state.events).toEqual([]);
  expect(state.orgs).toEqual([]);
  expect(state.volunteers).toEqual([]);
  expect(state.me.name).toBe('');
  expect(state.me.historyRu).toEqual([]);
  expect(state.cities.every((c) => c.active === 0 && c.vol === 0)).toBe(true);
});

test('platform loading fetches volunteer events without contacting the retired charity API', async () => {
  api.getCities.mockResolvedValue({ cities: [] });
  api.getOrgs.mockResolvedValue({ orgs: [] });
  api.getEvents.mockResolvedValue({ events: [{ id: 42, titleRu: 'Волонтёрское мероприятие', orgId: 3 }] });
  api.leaderboardVolunteers.mockResolvedValue({ volunteers: [] });
  api.getBadges.mockResolvedValue({ badges: [] });
  await usePlatformStore.getState().loadPlatform();
  expect(api.getCharity).not.toHaveBeenCalled();
  expect(usePlatformStore.getState().events).toEqual([{ id: 'e42', titleRu: 'Волонтёрское мероприятие', orgId: 'o3' }]);
  expect(usePlatformStore.getState()).not.toHaveProperty('charity');
});

test.each(['coord', 'org'])('profile loading synchronizes the %s role used by event creation', async (role) => {
  useSessionStore.setState({ role: 'vol' });
  api.userMe.mockResolvedValue({ user: { id: 42, name: 'Иван Тестовый', role } });
  await usePlatformStore.getState().loadMe();
  expect(usePlatformStore.getState().me).toMatchObject({ id: 42, role });
  expect(useSessionStore.getState().role).toBe(role);
});
