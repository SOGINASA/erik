import { act, fireEvent, render, screen } from '@testing-library/react';
import GuestGathering from './GuestGathering';

const mockNavigate = jest.fn();
const mockToast = jest.fn();
const mockRsvp = jest.fn();
const mockPickRole = jest.fn();
const mockLoadGuest = jest.fn();
let mockCanRespond = false;
let mockLanguage = 'ru';
const mockGathering = {
  status: 'open', titleRu: 'Уборка парка', titleKz: 'Саябақты тазалау',
  placeRu: 'Алматы', placeKz: 'Алматы', dateRu: '28 сентября', dateKz: '28 қыркүйек', time: '10:00',
  needed: 10, comingCount: 0, roles: [], myAnswer: null,
};

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ code: 'PARK18' }),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('../i18n', () => ({
  useLang: () => mockLanguage,
  useT: () => ({ ansYes: 'Приду', ansMaybe: 'Пока не знаю', ansNo: 'Отказаться', youAnswered: 'Вы ответили', change: 'Изменить' }),
}));
jest.mock('../store/useGatheringStore', () => ({
  useGatheringStore: (select) => select({
    gathering: mockGathering, guestError: null, loadGuest: mockLoadGuest,
    rsvp: mockRsvp, pickGuestRole: mockPickRole,
  }),
}));
jest.mock('../store/useSessionStore', () => ({ useSessionReady: () => mockCanRespond }));
jest.mock('../store/useUiStore', () => ({ useUiStore: (select) => select({ showToast: mockToast }) }));
jest.mock('../store/usePlatformStore', () => ({ usePlatformStore: (select) => select({ me: null }) }));
jest.mock('../components/shell/Brand', () => ({ Logo: () => <span>erik</span>, LangToggle: () => null }));
jest.mock('../components/LegalLinks', () => () => <a href="/privacy">Политика конфиденциальности</a>);
jest.mock('../sheets/Sheets', () => ({ RoleRow: () => null, sortRolesForViewer: (roles) => roles }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanRespond = false;
  mockLanguage = 'ru';
  mockLoadGuest.mockResolvedValue();
  mockRsvp.mockResolvedValue({ ok: true });
});

test('public invitation links retain the invitation and anonymous answers do not mutate RSVP', async () => {
  render(<GuestGathering />);
  await screen.findByRole('heading', { name: 'Уборка парка' });
  expect(screen.getByRole('link', { name: 'войдите' })).toHaveAttribute('href', '/login?returnTo=%2Fg%2FPARK18');
  expect(screen.getByRole('link', { name: 'создайте аккаунт' })).toHaveAttribute('href', '/register?returnTo=%2Fg%2FPARK18');
  expect(screen.getByRole('link', { name: 'Политика конфиденциальности' })).toHaveAttribute('href', '/privacy');
  fireEvent.click(screen.getByRole('button', { name: 'Приду' }));
  expect(mockNavigate).toHaveBeenCalledWith('/register?returnTo=%2Fg%2FPARK18');
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('После этого вы вернётесь к сбору'));
  expect(mockRsvp).not.toHaveBeenCalled();
  expect(mockPickRole).not.toHaveBeenCalled();
  expect(screen.queryByText(/Вы ответили/)).not.toBeInTheDocument();
});

test('anonymous signup handoff explains the next step in Kazakh', async () => {
  mockLanguage = 'kz';
  render(<GuestGathering />);
  await screen.findByRole('heading', { name: 'Саябақты тазалау' });
  fireEvent.click(screen.getByRole('button', { name: 'Приду' }));
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('осы жиынға ораласыз'));
  expect(mockRsvp).not.toHaveBeenCalled();
});

test('an authenticated answer is shown only after a successful server response', async () => {
  mockCanRespond = true;
  let finish;
  mockRsvp.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<GuestGathering />);
  await screen.findByRole('heading', { name: 'Уборка парка' });
  fireEvent.click(screen.getByRole('button', { name: 'Приду' }));
  expect(screen.getByRole('status')).toHaveTextContent('Сохраняем ответ');
  expect(screen.queryByText(/Вы ответили/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Приду' })).toBeDisabled();
  await act(async () => { finish({ ok: true }); });
  expect(screen.getByText('Вы ответили: Приду')).toBeInTheDocument();
});

test('failed RSVP does not show a recorded answer', async () => {
  mockCanRespond = true;
  mockRsvp.mockResolvedValue({ ok: false, error: { status: 500 } });
  render(<GuestGathering />);
  await screen.findByRole('heading', { name: 'Уборка парка' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Приду' })); });
  expect(screen.queryByText(/Вы ответили/)).not.toBeInTheDocument();
  expect(mockToast).toHaveBeenCalledWith('Не удалось сохранить ответ');
  expect(screen.getByRole('button', { name: 'Приду' })).toBeEnabled();
});
