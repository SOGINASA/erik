import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OAuthCallback from './OAuthCallback';
import { api } from '../lib/api';

const mockNavigate = jest.fn();
const mockAccept = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('../components/shell/Brand', () => ({ Logo: () => <span>erik</span> }));
jest.mock('../store/useSessionStore', () => ({ useSessionStore: { getState: () => ({ acceptOAuthSession: mockAccept }) } }));
jest.mock('../lib/api', () => ({ api: { oauthExchange: jest.fn(), legal: jest.fn() } }));

const code = 'a'.repeat(43), verifier = 'b'.repeat(43);
const success = { access_token: 'access', refresh_token: 'refresh', user: { user_type: 'user' } };
const legal = { version: 'current', registrationAvailable: true, operator: { name: 'Test', email: 'test@example.test' } };
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/oauth/callback#code=' + code);
  sessionStorage.setItem('erik-google-login', JSON.stringify({ verifier, createdAt: Date.now(), returnTo: '/g/TEST' }));
  api.legal.mockResolvedValue(legal);
});

test('exchanges once under StrictMode, clears code and resumes invitation', async () => {
  api.oauthExchange.mockResolvedValue(success);
  render(<StrictMode><OAuthCallback /></StrictMode>);
  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(success));
  expect(api.oauthExchange).toHaveBeenCalledTimes(1);
  expect(api.oauthExchange).toHaveBeenCalledWith({ code, verifier });
  expect(mockNavigate).toHaveBeenCalledWith('/g/TEST', { replace: true });
  expect(window.location.hash).toBe('');
  expect(sessionStorage.getItem('erik-google-login')).toBeNull();
});

test('new Google identity requires explicit consent and editable full name', async () => {
  api.oauthExchange.mockResolvedValueOnce({ status: 'registration_required', full_name: 'Google Person' }).mockResolvedValue(success);
  render(<OAuthCallback />);
  const button = await screen.findByRole('button', { name: 'Создать аккаунт' });
  await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toBeEnabled());
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Фамилия и имя'), { target: { value: 'Иванов Иван' } });
  screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
  fireEvent.click(button);
  await waitFor(() => expect(mockAccept).toHaveBeenCalled());
  expect(api.oauthExchange.mock.calls[1][0]).toMatchObject({ full_name: 'Иванов Иван', legal: {
    version: 'current', termsAccepted: true, privacyAccepted: true, consentAccepted: true, adultConfirmed: true,
  } });
});

test('link requires the existing password and shows wrong-password errors', async () => {
  api.oauthExchange.mockResolvedValueOnce({ status: 'link_required' }).mockRejectedValueOnce({ data: { error: 'Неверный пароль' } });
  render(<OAuthCallback />);
  const input = await screen.findByLabelText('Пароль аккаунта');
  expect(screen.getByRole('button', { name: 'Привязать Google и войти' })).toBeDisabled();
  fireEvent.change(input, { target: { value: 'incorrect' } });
  fireEvent.click(screen.getByRole('button', { name: 'Привязать Google и войти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Неверный пароль');
  expect(mockAccept).not.toHaveBeenCalled();
});

test('missing browser verifier cannot exchange a code', () => {
  sessionStorage.clear();
  render(<OAuthCallback />);
  expect(screen.getByRole('alert')).toHaveTextContent('Вход отменён или истёк');
  expect(api.oauthExchange).not.toHaveBeenCalled();
});

test('document updates clear confirmations and fetch the current edition', async () => {
  api.oauthExchange.mockResolvedValueOnce({ status: 'registration_required', full_name: 'Google Person' })
    .mockRejectedValueOnce({ data: { code: 'legal_version_mismatch', error: 'Документы обновились' } });
  render(<OAuthCallback />);
  const button = await screen.findByRole('button', { name: 'Создать аккаунт' });
  await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toBeEnabled());
  screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
  fireEvent.click(button);
  await waitFor(() => expect(api.legal).toHaveBeenCalledTimes(2));
  expect(button).toBeDisabled();
  screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
});
