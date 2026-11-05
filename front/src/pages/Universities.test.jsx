import { fireEvent, render, screen } from '@testing-library/react';
import Universities from './Universities';
import { api } from '../lib/api';
jest.mock('../lib/api', () => ({ api: { universities: jest.fn() } }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('../store/useSessionStore', () => ({ useSessionStore: (select) => select({ token: 'token', isAdmin: () => false }) }));
jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }));

test('filters university directory by name, city and own membership', async () => {
  api.universities.mockResolvedValue({ universities: [
    { id: 1, name: 'Campus One', city: 'Астана', eventsCount: 3, membership: { status: 'approved' } },
    { id: 2, name: 'Campus Two', city: 'Алматы', eventsCount: 0, membership: null },
  ] });
  render(<Universities />);
  expect(await screen.findByRole('link', { name: /Campus One/ })).toHaveAttribute('href', '/universities/1');
  fireEvent.change(screen.getByLabelText('Поиск университета'), { target: { value: 'Two' } });
  expect(screen.queryByRole('link', { name: /Campus One/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Поиск университета'), { target: { value: '' } });
  fireEvent.click(screen.getByLabelText('Мои университеты'));
  expect(screen.queryByRole('link', { name: /Campus Two/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Мои университеты'));
  fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Алматы' } });
  expect(screen.getByRole('link', { name: /Campus Two/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Campus One/ })).not.toBeInTheDocument();
});
