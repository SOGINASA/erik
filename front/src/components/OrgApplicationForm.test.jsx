import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrgApplicationForm from './OrgApplicationForm';
import { api } from '../lib/api';
jest.mock('../lib/api', () => ({ api: { myOrgApplications: jest.fn(), createOrg: jest.fn() } }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a> }));
const values = { legalName: 'Общественный фонд Помощь', legalForm: 'Общественный фонд', bin: '123456789012', cityId: 'ast', cat: '', legalAddress: 'Астана', aboutRu: 'Помощь людям', publicContact: '@help', representativeName: 'Иван Иванов', authority: 'Руководитель по уставу', email: 'private@example.kz', phone: '+77001234567', authorityConfirmed: true };
const renderForm = () => render(<OrgApplicationForm cities={[{ id: 'ast', ru: 'Астана' }]} themes={[]} onRefresh={jest.fn()} />);
beforeEach(() => { jest.clearAllMocks(); api.myOrgApplications.mockResolvedValue({ applications: [] }); });

test('submits an application and replaces fields with pending status', async () => {
  api.createOrg.mockResolvedValue({ application: { id: 4, status: 'pending', data: values } });
  renderForm();
  await screen.findByRole('button', { name: 'Отправить на проверку' });
  const fields = [['БИН · 12 цифр', 'bin'], ['Полное наименование', 'legalName'], ['Организационно-правовая форма', 'legalForm'], ['Город деятельности', 'cityId'], ['Юридический адрес · только для проверки', 'legalAddress'], ['Чем занимается организация и для чего нужны волонтёры', 'aboutRu'], ['Публичный контакт НКО · email, телефон или Telegram', 'publicContact'], ['Ваши ФИО', 'representativeName'], ['Должность и основание полномочий', 'authority'], ['Email', 'email'], ['Телефон с кодом страны', 'phone']];
  fields.forEach(([label, key]) => fireEvent.change(screen.getByLabelText(label), { target: { value: values[key] } }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Подтверждаю достоверность/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Даю согласие/ }));
  fireEvent.submit(screen.getByRole('button', { name: 'Отправить на проверку' }).closest('form'));
  await screen.findByRole('heading', { name: 'Заявка на проверке' });
  expect(api.createOrg).toHaveBeenCalledWith({ ...values, dataConsent: true });
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
});

test('rejected application displays reason and prefilled fields requiring new confirmation', async () => {
  api.myOrgApplications.mockResolvedValue({ applications: [{ id: 3, status: 'rejected', reason: 'Уточните полномочия представителя', data: values }] });
  renderForm();
  await screen.findByText('Уточните полномочия представителя');
  expect(screen.getByLabelText('Полное наименование')).toHaveValue(values.legalName);
  expect(screen.getByRole('checkbox', { name: /Подтверждаю достоверность/ })).not.toBeChecked();
});

test('failed status load offers retry before allowing submission', async () => {
  api.myOrgApplications.mockRejectedValueOnce(new Error('Сеть недоступна'));
  renderForm();
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Отправить на проверку' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeInTheDocument());
});
