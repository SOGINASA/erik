import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './Login';

const mockNavigate = jest.fn();
const mockLogin = jest.fn();
const mockToast = jest.fn();
const mockLocation = { search: '' };

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
