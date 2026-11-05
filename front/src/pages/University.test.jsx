import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import University from './University';
import { api } from '../lib/api';

let mockSession;
jest.mock('../lib/api', () => ({ api: { university: jest.fn(), universityMemberships: jest.fn(),
  joinUniversity: jest.fn(), universityMicrosoftStart: jest.fn(), studentCard: jest.fn(), decideUniversityMembership: jest.fn() } }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('../store/useSessionStore', () => ({ useSessionStore: (select) => select(mockSession) }));
jest.mock('../store/useGatheringStore', () => ({ useGatheringStore: (select) => select({ regs: {} }) }));
jest.mock('../components/EventCard', () => () => <div>Event card</div>);
jest.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a>,
  useParams: () => ({ id: '5' }), useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }));

const university = { id: 5, name: 'Campus University', nameKz: 'Campus', city: 'Астана',
  canManage: false, membership: null, microsoftEnabled: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { token: 'token', loggedIn: true, name: 'Student Name', phone: '+77771234567', isAdmin: () => false, role: 'vol' };
  api.university.mockResolvedValue({ university, events: [] });
});

test('guest gets login return link and no private requests', async () => {
  mockSession.loggedIn = false; mockSession.token = null;
  render(<University />);
  expect(await screen.findByRole('link', { name: /Войти \/ зарегистрироваться/ })).toHaveAttribute('href', '/login?returnTo=%2Funiversities%2F5');
  expect(screen.queryByLabelText('Фото студенческого билета')).not.toBeInTheDocument();
  expect(api.universityMemberships).not.toHaveBeenCalled();
});

test('pending application shows status and hides duplicate form', async () => {
  api.university.mockResolvedValue({ university: { ...university, membership: { status: 'pending' } }, events: [] });
  render(<University />);
  await screen.findByText('Заявка на проверке');
  expect(screen.queryByRole('button', { name: 'Отправить заявку' })).not.toBeInTheDocument();
  expect(api.universityMemberships).not.toHaveBeenCalled();
});

test('Microsoft option appears only when configured and errors remain actionable', async () => {
  api.university.mockResolvedValue({ university: { ...university, microsoftEnabled: true }, events: [] });
  api.universityMicrosoftStart.mockRejectedValue(new Error('Microsoft временно недоступен'));
  render(<University />);
  fireEvent.click(await screen.findByRole('button', { name: 'Продолжить с Microsoft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Microsoft временно недоступен');
  expect(screen.getByRole('button', { name: 'Продолжить с Microsoft' })).toBeEnabled();
});

test('submits student card privately and updates pending membership after success', async () => {
  api.joinUniversity.mockResolvedValue({ membership: { status: 'pending' } });
  render(<University />);
  await screen.findByRole('button', { name: 'Отправить заявку' });
  api.university.mockResolvedValue({ university: { ...university, membership: { status: 'pending' } }, events: [] });
  fireEvent.change(screen.getByLabelText(/Фото студенческого билета/), { target: { files: [new File(['photo'], 'card.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Факультет / образовательная программа'), { target: { value: 'Информатика' } });
  fireEvent.change(screen.getByLabelText('Курс обучения'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('В каких волонтёрских делах хотите участвовать?'), { target: { value: 'Экологические акции' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));
  await waitFor(() => expect(api.joinUniversity).toHaveBeenCalledWith(5, expect.objectContaining({
    fullName: 'Student Name', phone: '+77771234567', consent: true, studentCard: expect.stringMatching(/^data:image\/png;base64,/) })));
  await screen.findByText('Заявка на проверке');
});

test('load failure offers retry instead of showing an empty university', async () => {
  api.university.mockRejectedValueOnce(new Error('offline'));
  render(<University />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Мероприятия университета')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByText('Campus University');
});
