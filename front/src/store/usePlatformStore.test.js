import { usePlatformStore } from './usePlatformStore';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: {
    getCities: jest.fn(), getOrgs: jest.fn(), getEvents: jest.fn(),
    leaderboardVolunteers: jest.fn(), getBadges: jest.fn(), getCharity: jest.fn(),
  },
  setAuth: jest.fn(), onAuthRefresh: jest.fn(),
}));

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
