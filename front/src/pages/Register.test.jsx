import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Register from './Register';
import { api } from '../lib/api';

const mockNavigate = jest.fn();
const mockRegisterAccount = jest.fn();
const mockLogin = jest.fn();
const mockToast = jest.fn();
const mockLocation = { search: '' };

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('../store/useSessionStore', () => ({
  useSessionStore: (select) => select({ registerAccount: mockRegisterAccount, login: mockLogin }),
}));
jest.mock('../store/useUiStore', () => ({ useUiStore: (select) => select({ showToast: mockToast }) }));
jest.mock('../store/usePlatformStore', () => ({
  usePlatformStore: (select) => select({ cities: [{ id: 'almaty', ru: 'Алматы' }] }),
}));
jest.mock('../components/shell/Brand', () => ({ Logo: () => <span>erik</span>, LangToggle: () => null }));
jest.mock('../lib/api', () => ({ api: { legal: jest.fn() } }));

const legal = {
  version: '2026-09-28.1-operator-1', registrationAvailable: true,
  operator: { name: 'Тестовый оператор', email: 'privacy@example.kz' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLocation.search = '';
  api.legal.mockResolvedValue(legal);
  mockRegisterAccount.mockResolvedValue({ user: { full_name: 'Иванов Иван' } });
});

async function fillRegistration(role = /Волонтёр/) {
  render(<Register />);
  fireEvent.click(screen.getByRole('button', { name: role }));
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  fireEvent.change(screen.getByLabelText('Фамилия, имя и отчество (при наличии)'), { target: { value: 'Иванов Иван' } });
  fireEvent.change(screen.getByLabelText('Телефон (необязательно)'), { target: { value: '+7 700 000 00 00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  fireEvent.change(screen.getByLabelText('Email или логин'), { target: { value: 'ivan@example.kz' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password1' } });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Алматы' }));
  await waitFor(() => expect(screen.queryByText('Загружаем условия регистрации…')).not.toBeInTheDocument());
}

function acceptAll() {
  screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
}

test('requires four independent unchecked confirmations and opens all documents safely', async () => {
  await fillRegistration();
  const submit = screen.getByRole('button', { name: 'Создать аккаунт' });
  const checkboxes = screen.getAllByRole('checkbox');
  expect(screen.getByText(/Имя из профиля, город, показатели активности и история участия/)).toHaveTextContent('в том числе без входа');
  expect(checkboxes).toHaveLength(4);
  checkboxes.forEach((checkbox) => expect(checkbox).not.toBeChecked());
  expect(submit).toBeDisabled();
  checkboxes.slice(0, 3).forEach((checkbox) => fireEvent.click(checkbox));
  expect(submit).toBeDisabled();
  fireEvent.submit(submit.closest('form'));
  expect(mockRegisterAccount).not.toHaveBeenCalled();
  fireEvent.click(checkboxes[3]);
  expect(submit).toBeEnabled();
  for (const [name, href] of [
    ['Пользовательское соглашение', '/terms'],
    ['Политикой конфиденциальности', '/privacy'],
    ['согласие на сбор и обработку персональных данных', '/consent'],
  ]) {
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  expect(screen.queryByText(/Аккаунт создан/)).not.toBeInTheDocument();
});

test('sends explicit consent and the loaded version, then navigates only after success', async () => {
  await fillRegistration(/НКО \/ организация/);
  acceptAll();
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/manage'));
  expect(mockRegisterAccount).toHaveBeenCalledWith({
    identifier: 'ivan@example.kz', password: 'password1', full_name: 'Иванов Иван',
    role: 'org', phone: '+7 700 000 00 00', cityId: 'almaty', interests: [],
    legal: { version: legal.version, termsAccepted: true, privacyAccepted: true, consentAccepted: true, adultConfirmed: true },
  });
  expect(mockToast).toHaveBeenCalledWith('Аккаунт создан. Добро пожаловать в erik!');
});

test.each([
  ['/g/PARK18', '/g/PARK18'],
  ['https://outside.example/phish', '/feed'],
  ['//outside.example/phish', '/feed'],
  ['/admin', '/feed'],
])('limits post-registration returnTo %s to invitation pages', async (returnTo, destination) => {
  mockLocation.search = `?returnTo=${encodeURIComponent(returnTo)}`;
  await fillRegistration();
  const loginLink = screen.getByRole('link', { name: 'Войти' });
  expect(loginLink).toHaveAttribute('href', destination === '/feed' ? '/login' : `/login?returnTo=${encodeURIComponent(destination)}`);
  acceptAll();
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(destination));
});

test('failed registration stays in the form and retains entered data without a device login', async () => {
  mockRegisterAccount.mockRejectedValueOnce({ data: { error: 'Этот email уже используется' } });
  await fillRegistration();
  acceptAll();
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Этот email уже используется');
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  expect(screen.getByLabelText('Email или логин')).toHaveValue('ivan@example.kz');
  expect(screen.getByLabelText('Пароль')).toHaveValue('password1');
});

test('blocks duplicate submissions while the server request is pending', async () => {
  let resolve;
  mockRegisterAccount.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await fillRegistration();
  acceptAll();
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  const pending = screen.getByRole('button', { name: 'Создаём аккаунт…' });
  expect(pending).toBeDisabled();
  fireEvent.submit(pending.closest('form'));
  expect(mockRegisterAccount).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => { resolve({ user: {} }); });
  expect(mockNavigate).toHaveBeenCalledWith('/feed');
});

test('reloads changed terms and requires fresh confirmations before retrying', async () => {
  mockRegisterAccount.mockRejectedValueOnce({ data: { code: 'legal_version_mismatch' } });
  api.legal.mockResolvedValueOnce(legal).mockResolvedValue({ ...legal, version: 'new-version' });
  await fillRegistration();
  acceptAll();
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  expect(await screen.findByText(/Условия обновились/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toBeEnabled());
  screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());
  expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();
  acceptAll();
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  await waitFor(() => expect(mockRegisterAccount).toHaveBeenCalledTimes(2));
  expect(mockRegisterAccount.mock.calls[1][0].legal.version).toBe('new-version');
});

test.each([
  ['failed load', () => api.legal.mockRejectedValue(new Error('offline')), /Не удалось загрузить условия/],
  ['unconfigured operator', () => api.legal.mockResolvedValue({ ...legal, registrationAvailable: false }), /Регистрация временно недоступна/],
])('blocks registration on %s and lets the user retry', async (_, configure, message) => {
  configure();
  await fillRegistration();
  expect(screen.getByRole('alert')).toHaveTextContent(message);
  screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();
  expect(mockRegisterAccount).not.toHaveBeenCalled();
  api.legal.mockResolvedValue(legal);
  fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
  await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();
});
