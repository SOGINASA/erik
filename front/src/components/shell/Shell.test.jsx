import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextEncoder } from 'util';

global.TextEncoder = TextEncoder;
jest.mock('react-router-dom', () => jest.requireActual('react-router'));
jest.mock('../../lib/api', () => ({ api: { me: jest.fn(), logout: jest.fn() }, setAuth: jest.fn(), onAuthRefresh: jest.fn() }));

const { MemoryRouter, Routes, Route, useLocation } = require('react-router-dom');
const { useSessionStore } = require('../../store/useSessionStore');
const { useUiStore } = require('../../store/useUiStore');
const { api } = require('../../lib/api');
const Shell = require('./Shell').default;

function Location() { return <output aria-label="Current route">{useLocation().pathname}</output>; }
function renderShell(path = '/admin') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Shell />}>
      <Route path="/admin" element={<p>Admin overview content</p>} />
      <Route path="/admin/users" element={<p>Admin users content</p>} />
      <Route path="/feed" element={<p>Volunteer feed content</p>} />
      <Route path="/u/:id" element={<p>Profile review content</p>} />
    </Route>
    <Route path="/login" element={<p>Login content</p>} />
  </Routes><Location /></MemoryRouter>);
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
  useSessionStore.setState({ loggedIn: true, token: 'test-token', userType: 'admin', role: 'vol', name: 'Тестовый Администратор', booted: true, lang: 'ru' });
  useUiStore.setState({ showToast: jest.fn() });
});

test.each([1200, 390])('admin has only admin navigation at width %s', (width) => {
  window.innerWidth = width;
  renderShell();
  expect(screen.getByRole('navigation', { name: 'Разделы администрирования' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Обзор' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Модерация' })).toHaveAttribute('href', '/admin/moderation');
  for (const label of ['Лента', 'Карта', 'Мои мероприятия', 'В приложение', 'Мой профиль', 'Ещё']) {
    expect(screen.queryByRole('button', { name: label, exact: true })).not.toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: 'Выйти из аккаунта' })).toBeInTheDocument();
});

test('legacy feed entry redirects administrator before volunteer content mounts', () => {
  renderShell('/feed');
  expect(screen.getByText('Admin overview content')).toBeInTheDocument();
  expect(screen.queryByText('Volunteer feed content')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
});

test('reviewing a user profile retains admin navigation and can return to users', () => {
  renderShell('/u/42');
  expect(screen.getByText('Profile review content')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Пользователи' }));
  expect(screen.getByText('Admin users content')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Пользователи' })).toHaveAttribute('aria-current', 'page');
});

test('admin can log out directly from the admin workspace', async () => {
  api.logout.mockResolvedValue({});
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  await screen.findByText('Login content');
  expect(api.logout).toHaveBeenCalledTimes(1);
  expect(useSessionStore.getState().loggedIn).toBe(false);
});

test('failed logout keeps the admin workspace and allows retry', async () => {
  api.logout.mockRejectedValue(new Error('Нет связи'));
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  await waitFor(() => expect(useUiStore.getState().showToast).toHaveBeenCalledWith('Нет связи'));
  expect(screen.getByText('Admin overview content')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Выйти из аккаунта' })).toBeEnabled();
});

test('volunteer retains the ordinary interface and cannot see admin content', () => {
  useSessionStore.setState({ userType: 'user' });
  renderShell('/admin');
  expect(screen.getByText('Volunteer feed content')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Разделы администрирования' })).not.toBeInTheDocument();
  expect(screen.queryByText('Admin overview content')).not.toBeInTheDocument();
});
