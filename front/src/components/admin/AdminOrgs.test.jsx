import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminOrgs from './AdminOrgs';
import { api } from '../../lib/api';
jest.mock('../../lib/api', () => ({ api: { adminOrgs: jest.fn(), adminOrgApplications: jest.fn(), decideOrgApplication: jest.fn() } }));
jest.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a> }));

test('approval requires evidence and checks, then refreshes the queue', async () => {
  api.adminOrgs.mockResolvedValue({ orgs: [] });
  api.adminOrgApplications.mockResolvedValueOnce({ applications: [{ id: 8, status: 'pending', createdAt: '2026-11-05', data: { legalName: 'Фонд', bin: '123456789012', email: 'private@example.kz' } }] }).mockResolvedValue({ applications: [] });
  api.decideOrgApplication.mockResolvedValue({});
  render(<AdminOrgs />);
  fireEvent.click(await screen.findByText(/Фонд · БИН/));
  const approve = screen.getByRole('button', { name: 'Одобрить и создать НКО' });
  expect(approve).toBeDisabled();
  expect(screen.getByText('private@example.kz')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Результат проверки/), { target: { value: 'Реестр и полномочия сверены' } });
  expect(approve).toBeDisabled();
  screen.getAllByRole('checkbox').forEach((c) => fireEvent.click(c));
  expect(approve).toBeEnabled();
  fireEvent.click(approve);
  await waitFor(() => expect(api.decideOrgApplication).toHaveBeenCalledWith(8, { decision: 'approved', note: 'Реестр и полномочия сверены', registryChecked: true, authorityChecked: true }));
  await screen.findByText('В этой категории заявок нет.');
});
