import { fireEvent, render, screen } from '@testing-library/react';
import { TextEncoder } from 'util';
global.TextEncoder = TextEncoder;
jest.mock('react-router-dom', () => jest.requireActual('react-router'));
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const AttendanceConfirm = require('./AttendanceConfirm').default;
const { api } = require('../lib/api');
const mockSession = { booted: true, token: 'session-token' };
jest.mock('../store/useSessionStore', () => ({ useSessionStore: (select) => select(mockSession) }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('../components/shell/Brand', () => ({ Logo: () => null, LangToggle: () => null }));
jest.mock('../lib/api', () => ({ api: { previewAttendance: jest.fn(), confirmAttendance: jest.fn() } }));

function open() {
  return render(<MemoryRouter initialEntries={['/attendance/7#signed.token']}><Routes><Route path="/attendance/:id" element={<AttendanceConfirm />} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.token = 'session-token';
  api.previewAttendance.mockResolvedValue({ title: 'Уборка парка', participantName: 'Айдана', presence: null });
  api.confirmAttendance.mockResolvedValue({ title: 'Уборка парка', participantName: 'Айдана', presence: 'came' });
});

test('scanning previews the event and requires an explicit confirmation', async () => {
  open();
  const button = await screen.findByRole('button', { name: 'Я на месте' });
  expect(api.confirmAttendance).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(await screen.findByRole('heading', { name: 'Приход подтверждён' })).toBeInTheDocument();
  expect(api.confirmAttendance).toHaveBeenCalledWith('7', 'signed.token');
  expect(screen.queryByRole('button', { name: 'Я на месте' })).not.toBeInTheDocument();
});

test('expired code gives recovery instructions without confirming', async () => {
  api.previewAttendance.mockRejectedValue({ status: 410, data: { code: 'expired_qr' } });
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Отсканируйте новый код');
  expect(api.confirmAttendance).not.toHaveBeenCalled();
});

test('login preserves the attendance URL including the token', async () => {
  mockSession.token = null;
  open();
  const link = await screen.findByRole('link', { name: 'Войти в свой аккаунт' });
  expect(new URLSearchParams(link.getAttribute('href').split('?')[1]).get('returnTo')).toBe('/attendance/7#signed.token');
  expect(api.previewAttendance).not.toHaveBeenCalled();
});

test('a lost confirmation response can be retried through the server preview', async () => {
  api.confirmAttendance.mockRejectedValue(new Error('offline'));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Я на месте' }));
  const retry = await screen.findByRole('button', { name: 'Повторить' });
  api.previewAttendance.mockResolvedValue({ title: 'Уборка парка', presence: 'came' });
  fireEvent.click(retry);
  expect(await screen.findByRole('heading', { name: 'Приход подтверждён' })).toBeInTheDocument();
  expect(api.confirmAttendance).toHaveBeenCalledTimes(1);
});
