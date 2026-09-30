import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './Login';

const mockNavigate = jest.fn();
const mockLogin = jest.fn();
const mockToast = jest.fn();
const mockLocation = { search: '' };
const mockForgot = jest.fn();
jest.mock('../lib/api', () => ({ api: { forgotPassword: (...args) => mockForgot(...args) } }));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('../store/useSessionStore', () => ({
  useSessionStore: (select) => select({ loginWithPassword: mockLogin, loginAsDevice: jest.fn() }),
}));
jest.mock('../store/useUiStore', () => ({ useUiStore: (select) => select({ showToast: mockToast }) }));
jest.mock('../components/shell/Brand', () => ({ Logo: () => <span>erik</span>, LangToggle: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockLocation.search = '';
  mockLogin.mockResolvedValue({ user: {} });
});

test('demo login buttons and credentials are visible', () => {
  render(<Login />);
  for (const name of ['Волонтёр', 'Координатор', 'НКО', 'Войти как администратор']) {
    expect(screen.getByRole('button', { name, exact: true })).toBeInTheDocument();
  }
  expect(screen.getByText(/admin123/)).toBeInTheDocument();
});

test('invalid credentials do not claim the backend is offline', async () => {
  mockLogin.mockRejectedValueOnce({ status: 401 });
  render(<Login />);
  fireEvent.change(screen.getByPlaceholderText('you@example.kz'), { target: { value: 'absent@example.kz' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти', exact: true }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('Неверный email')));
});

test('disabled email does not claim a reset email was sent', async () => {
  mockForgot.mockRejectedValueOnce({ status: 503, data: { error: 'Отправка писем не настроена' } });
  render(<Login />);
  fireEvent.change(screen.getByPlaceholderText('you@example.kz'), { target: { value: 'person@example.kz' } });
  fireEvent.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Отправка писем не настроена'));
});

test.each([
  ['/g/PARK18', '/g/PARK18'],
  ['https://outside.example', '/feed'],
])('login returnTo %s honors only an invitation path', async (returnTo, destination) => {
  mockLocation.search = `?returnTo=${encodeURIComponent(returnTo)}`;
  render(<Login />);
  expect(screen.getByRole('link', { name: 'Создать' })).toHaveAttribute('href', destination === '/feed' ? '/register' : '/register?returnTo=%2Fg%2FPARK18');
  fireEvent.change(screen.getByPlaceholderText('you@example.kz'), { target: { value: 'ivan@example.kz' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти', exact: true }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(destination));
  expect(mockLogin).toHaveBeenCalledWith({ identifier: 'ivan@example.kz', password: 'password1' });
});
