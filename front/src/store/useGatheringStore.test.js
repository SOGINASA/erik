import { useGatheringStore } from './useGatheringStore';
import { usePlatformStore } from './usePlatformStore';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({ api: { setEventReg: jest.fn(), deleteEventReg: jest.fn() }, setAuth: jest.fn(), onAuthRefresh: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  usePlatformStore.setState({ events: [{ id: 'e9', going: 1, roles: [] }] });
  useGatheringStore.setState({ regs: { e9: 'yes' } });
});

test('answer and roles change only after the server commits, so confirmation reads fresh data', async () => {
  let finish;
  api.setEventReg.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const pending = useGatheringStore.getState().registerEvent('e9', 'maybe', [1, 2]);
  expect(useGatheringStore.getState().regs.e9).toBe('yes');
  expect(api.setEventReg).toHaveBeenCalledWith('9', 'maybe', { roleIds: [1, 2] });
  finish({ answer: 'maybe', going: 0, roleIds: [1, 2], roles: [{ id: 1 }, { id: 2 }] });
  await pending;
  expect(useGatheringStore.getState().regs.e9).toBe('maybe');
  expect(usePlatformStore.getState().events[0]).toMatchObject({ going: 0, myRoleIds: [1, 2] });
});

test('failed role capacity check preserves the saved answer and updates available roles', async () => {
  api.setEventReg.mockRejectedValue({ status: 409, message: 'Мест нет', data: { roles: [{ id: 1, free: 0 }] } });
  const result = await useGatheringStore.getState().registerEvent('e9', 'maybe', [1]);
  expect(result.ok).toBe(false);
  expect(useGatheringStore.getState().regs.e9).toBe('yes');
  expect(usePlatformStore.getState().events[0]).toMatchObject({ going: 1, roles: [{ id: 1, free: 0 }] });
});

test('cancellation waits for persisted removal before triggering confirmation refresh', async () => {
  let finish;
  api.deleteEventReg.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const pending = useGatheringStore.getState().unregisterEvent('e9');
  expect(useGatheringStore.getState().regs.e9).toBe('yes');
  finish({});
  await pending;
  expect(useGatheringStore.getState().regs.e9).toBeUndefined();
  expect(usePlatformStore.getState().events[0].going).toBe(0);
});
