import { act, fireEvent, render, screen } from '@testing-library/react';
import AttendanceQr from './AttendanceQr';
import { api } from '../lib/api';
import QRCode from 'qrcode';

jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('../lib/api', () => ({ api: { attendanceQr: jest.fn() } }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-04T10:00:00Z'));
  jest.clearAllMocks();
  api.attendanceQr.mockImplementation(async () => ({ token: String(Date.now()), expiresAt: new Date(Date.now() + 300000).toISOString(), expiresIn: 300 }));
  QRCode.toDataURL.mockImplementation(async (url) => `data:image/png;base64,${url}`);
});
afterEach(() => jest.useRealTimers());

test('organizer opens the QR and it rotates at five minutes, then stops when hidden', async () => {
  render(<AttendanceQr gatheringId="7" online />);
  expect(api.attendanceQr).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Показать QR-код' })));
  const first = screen.getByRole('img').getAttribute('src');
  expect(QRCode.toDataURL.mock.calls[0][0]).toContain('/attendance/7#');
  expect(screen.getByText('Новый код через 5:00')).toBeInTheDocument();
  await act(async () => jest.advanceTimersByTime(299000));
  expect(api.attendanceQr).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(api.attendanceQr).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('img').getAttribute('src')).not.toBe(first);
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть QR-код' }));
  await act(async () => jest.advanceTimersByTime(300000));
  expect(api.attendanceQr).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('an expired QR disappears if refresh fails and recovers after a retry', async () => {
  render(<AttendanceQr gatheringId="7" online />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Показать QR-код' })));
  api.attendanceQr.mockRejectedValueOnce(new Error('offline'));
  await act(async () => jest.advanceTimersByTime(300000));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await act(async () => jest.advanceTimersByTime(15000));
  expect(screen.getByRole('img')).toBeInTheDocument();
});

test('offline mode never issues or displays a QR', () => {
  render(<AttendanceQr gatheringId="7" online={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Показать QR-код' }));
  expect(api.attendanceQr).not.toHaveBeenCalled();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('подключитесь к интернету');
});
