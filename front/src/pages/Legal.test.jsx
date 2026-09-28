import { fireEvent, render, screen, within } from '@testing-library/react';
import Legal from './Legal';
import { api } from '../lib/api';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('../components/shell/Brand', () => ({ Logo: () => <span>erik</span> }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('../lib/api', () => ({ api: { legal: jest.fn() } }));

const documents = Object.fromEntries(['terms', 'privacy', 'consent'].map((key) => [key, {
  title: `Документ ${key} с сервера`, summary: `Актуальное описание ${key}`,
  sections: [{ id: `${key}-scope`, title: '1. Область применения', paragraphs: [`Текст ${key} из действующей редакции.`], items: ['Первое условие', 'Второе условие'] }],
}]));
const legal = {
  publishedAt: '2026-09-28', version: '2026-09-28.1-runtime-operator', registrationAvailable: true,
  operator: { name: 'Тестовый оператор', bin: '123456789012', address: 'Республика Казахстан, Алматы, тестовый адрес', email: 'privacy@example.kz' },
  storageCountry: 'KZ', processors: 'Тестовый поставщик инфраструктуры в Казахстане', documents,
  sources: [{ title: 'Закон Республики Казахстан о персональных данных', url: 'https://adilet.zan.kz/rus/docs/Z1300000094' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.legal.mockResolvedValue(legal);
});

test.each([
  ['terms', 'Условия использования'],
  ['privacy', 'Политика конфиденциальности'],
  ['consent', 'Согласие на обработку персональных данных'],
])('renders %s from the current API document and operator snapshot', async (documentKey, title) => {
  render(<Legal documentKey={documentKey} />);
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем актуальную редакцию');
  const article = await screen.findByRole('article', { name: documents[documentKey].title });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  expect(document.title).toBe(`${title} — erik`);
  expect(screen.getByText(documents[documentKey].summary)).toBeInTheDocument();
  expect(within(article).getByText(`Текст ${documentKey} из действующей редакции.`)).toBeInTheDocument();
  expect(within(article).getByText('Первое условие')).toBeInTheDocument();
  expect(screen.getByText(`Версия ${legal.version}`)).toBeInTheDocument();
  expect(screen.getByText('28 сентября 2026 г.')).toHaveAttribute('dateTime', '2026-09-28');
  expect(screen.getByText(legal.operator.name)).toBeInTheDocument();
  expect(screen.getByText(legal.operator.bin)).toBeInTheDocument();
  expect(screen.getByText(legal.operator.address)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: legal.operator.email })).toHaveAttribute('href', 'mailto:privacy@example.kz');
  expect(screen.getByText(legal.processors)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Область применения' })).toHaveAttribute('href', `#${documentKey}-scope`);
  const source = screen.getByRole('link', { name: /Закон Республики Казахстан/ });
  expect(source).toHaveAttribute('href', legal.sources[0].url);
  expect(source).toHaveAttribute('target', '_blank');
  expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.queryByText('Регистрация пока недоступна')).not.toBeInTheDocument();
});

test('unconfigured operator leaves the public document readable and explains unavailable registration', async () => {
  api.legal.mockResolvedValue({ ...legal, registrationAvailable: false, operator: {}, storageCountry: '', processors: '' });
  render(<Legal documentKey="privacy" />);
  const article = await screen.findByRole('article', { name: documents.privacy.title });
  expect(within(article).getByText('Текст privacy из действующей редакции.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Регистрация пока недоступна');
  expect(screen.getByRole('status')).toHaveTextContent('Документы доступны для ознакомления');
  expect(screen.getByText('Не опубликовано')).toBeInTheDocument();
  expect(screen.getByText('Email ещё не опубликован')).toBeInTheDocument();
  expect(screen.getByText('Не подтверждено')).toBeInTheDocument();
  expect(screen.queryByText(legal.operator.name)).not.toBeInTheDocument();
});

test('network failure shows no substitute document and retries the API on request', async () => {
  api.legal.mockRejectedValueOnce(new Error('offline'));
  render(<Legal documentKey="consent" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить документ');
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.queryByText(legal.operator.name)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
  expect(await screen.findByRole('article', { name: documents.consent.title })).toBeInTheDocument();
  expect(api.legal).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a missing document is reported as unavailable instead of showing another document', async () => {
  api.legal.mockResolvedValue({ ...legal, documents: { terms: documents.terms } });
  render(<Legal documentKey="privacy" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить документ');
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.queryByText(documents.terms.summary)).not.toBeInTheDocument();
});
