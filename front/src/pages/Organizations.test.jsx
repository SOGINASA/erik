import { fireEvent, render, screen } from '@testing-library/react';
import Organizations from './Organizations';
import { api } from '../lib/api';
jest.mock('../lib/api', () => ({ api: { getOrgs: jest.fn() } }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('../store/useSessionStore', () => ({ useSessionStore: (select) => select({ loggedIn: false }) }));
jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }));

test('directory searches by name, city and BIN and links to profiles and login return', async () => {
  api.getOrgs.mockResolvedValue({ orgs: [{ id: 42, name: 'Фонд Помощь', bin: '123456789012', city: 'Астана', verified: true, events: 8, vol: 20 }] });
  render(<Organizations />);
  const link = await screen.findByRole('link', { name: /Фонд Помощь/ });
  expect(link).toHaveAttribute('href', '/o/o42');
  expect(screen.getByRole('link', { name: /Представляете НКО/ })).toHaveAttribute('href', '/login?returnTo=%2Fmanage%2Forg');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'нет такой' } });
  expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '123456789012' } });
  expect(screen.getByRole('link', { name: /Фонд Помощь/ })).toBeInTheDocument();
});

test('load failure is distinct from an empty directory and retry recovers', async () => {
  api.getOrgs.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ orgs: [] });
  render(<Organizations />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Каталог пока пуст')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByText('Каталог пока пуст');
});
