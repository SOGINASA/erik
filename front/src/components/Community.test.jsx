import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ParticipationConfirmation from './ParticipationConfirmation';
import ImageUpload from './ImageUpload';
import OrgPublicDetails, { OrgContacts } from './OrgPublicDetails';
import MessageParticipantButton from './MessageParticipantButton';
import { RegisterSheet } from '../sheets/Sheets';
import { api } from '../lib/api';

const mockNavigate = jest.fn();
const mockPatch = jest.fn();
const mockRegister = jest.fn();
const mockClose = jest.fn();
const mockLoadConversations = jest.fn();
let mockSession = { loggedIn: true, token: 'test' };
const mockPlatform = { me: { id: 1 }, events: [], patchEventConfirmation: mockPatch, loadConversations: mockLoadConversations };
const mockGathering = { gathering: null, regs: {}, registerEvent: mockRegister };

jest.mock('../i18n', () => ({ useLang: () => 'ru', useT: () => ({ registerTitle: 'Участие', ansYes: 'Приду', ansMaybe: 'Возможно', ansNo: 'Не приду' }) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, Link: ({ to, children }) => <a href={to}>{children}</a> }));
jest.mock('../store/useSessionStore', () => ({ useSessionStore: (select) => select(mockSession) }));
jest.mock('../store/usePlatformStore', () => ({ usePlatformStore: Object.assign((select) => select(mockPlatform), { getState: () => mockPlatform }) }));
jest.mock('../store/useGatheringStore', () => ({ useGatheringStore: Object.assign((select) => select(mockGathering), { getState: () => mockGathering, setState: jest.fn() }) }));
jest.mock('../store/useUiStore', () => ({ useUiStore: (select) => select({ sheetPayload: 'e9', closeSheet: mockClose }) }));
jest.mock('../store/useOrganizerStore', () => ({ useOrganizerStore: jest.fn() }));
jest.mock('../lib/api', () => ({ api: { getEvent: jest.fn(), confirmParticipation: jest.fn(), uploadImage: jest.fn(), getOrgReviews: jest.fn(), postOrgReview: jest.fn(), createConversation: jest.fn() }, setAuth: jest.fn(), onAuthRefresh: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { loggedIn: true, token: 'test' };
  api.getEvent.mockResolvedValue({ event: { status: 'open', confirmedCount: 0, remainingNeeded: 2, myConfirmed: false, roles: [] } });
});

test('confirmation updates counts only on success and prevents duplicate confirmation', async () => {
  let resolve;
  api.confirmParticipation.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<ParticipationConfirmation eventId={9} answer="yes" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить участие' }));
  expect(screen.getByRole('button', { name: /Подтвердить участие/ })).toBeDisabled();
  expect(api.confirmParticipation).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ confirmed: true, confirmedCount: 1, remainingNeeded: 1 }));
  expect(screen.getByRole('button', { name: 'Участие подтверждено' })).toBeDisabled();
  expect(mockPatch).toHaveBeenLastCalledWith('e9', { confirmedCount: 1, remainingNeeded: 1, myConfirmed: true });
});

test('failed confirmation can be retried without reporting success', async () => {
  api.confirmParticipation.mockRejectedValueOnce(new Error('Нет связи')).mockResolvedValueOnce({ confirmed: true, confirmedCount: 1, remainingNeeded: 1 });
  render(<ParticipationConfirmation eventId={9} answer="yes" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить участие' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи');
  expect(screen.queryByText('Участие подтверждено')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить участие' }));
  expect(await screen.findByText('Участие подтверждено')).toBeInTheDocument();
});

test('guest can read remaining places without a confirmation button', async () => {
  mockSession = { loggedIn: false, token: null };
  render(<ParticipationConfirmation eventId={9} />);
  expect(await screen.findByText('2')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Подтвердить участие' })).not.toBeInTheDocument();
});

test('photo selection uploads actual file and reports pending state to the form', async () => {
  const uploaded = jest.fn(), busy = jest.fn();
  api.uploadImage.mockResolvedValue({ url: 'https://example.test/photo.png' });
  render(<ImageUpload onUploaded={uploaded} onBusyChange={busy} />);
  fireEvent.change(screen.getByLabelText('Загрузить фото'), { target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] } });
  await waitFor(() => expect(uploaded).toHaveBeenCalledWith('https://example.test/photo.png'));
  expect(api.uploadImage).toHaveBeenCalledWith('data:image/png;base64,cG5n');
  expect(busy.mock.calls).toEqual([[true], [false]]);
});

test('invalid photos are rejected before uploading', () => {
  render(<ImageUpload onUploaded={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Загрузить фото'), { target: { files: [new File(['<svg/>'], 'photo.svg', { type: 'image/svg+xml' })] } });
  expect(screen.getByRole('alert')).toHaveTextContent('PNG, JPEG или WebP');
  expect(api.uploadImage).not.toHaveBeenCalled();
});

test('organization contacts have safe actionable links and coordinator names', () => {
  render(<OrgContacts org={{ contacts: { telegram: '@help', phone: '+7 777 000 00 00; +7 777 000 00 01' }, officeAddress: 'Астана, 1', mapUrl: 'https://2gis.kz/astana', coordinators: [{ name: 'Анна', contact: '@anna' }] }} />);
  expect(screen.getByRole('link', { name: /Telegram @help/ })).toHaveAttribute('href', 'https://t.me/help');
  expect(screen.getByRole('link', { name: /Телефон \+7 777 000 00 01/ })).toHaveAttribute('href', 'tel:+77770000001');
  expect(screen.getByRole('link', { name: '@anna' })).toHaveAttribute('href', 'https://t.me/anna');
  expect(screen.getByText('Астана, 1')).toBeInTheDocument();
});

test('existing review can be edited and persists across reload', async () => {
  const own = { id: 4, rating: 4, text: 'Хорошо', name: 'Анна' };
  api.getOrgReviews.mockResolvedValueOnce({ reviews: [own], ownReview: own, count: 1, averageRating: 4 });
  api.postOrgReview.mockResolvedValue({ ok: true });
  api.getOrgReviews.mockResolvedValueOnce({ reviews: [{ ...own, text: 'Спасибо команде' }], ownReview: { ...own, text: 'Спасибо команде' }, count: 1, averageRating: 4 });
  render(<OrgPublicDetails org={{ sid: 7, name: 'НКО' }} mine={false} />);
  await screen.findByRole('button', { name: 'Обновить отзыв' });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Спасибо команде' } });
  fireEvent.click(screen.getByRole('button', { name: 'Обновить отзыв' }));
  await waitFor(() => expect(api.postOrgReview).toHaveBeenCalledWith(7, { rating: 4, text: 'Спасибо команде' }));
  expect(await screen.findByText('Ваш отзыв сохранён.')).toBeInTheDocument();
  expect(await screen.findByDisplayValue('Спасибо команде')).toBeInTheDocument();
});

test('coordinator message opens the selected participant conversation without sending text', async () => {
  api.createConversation.mockResolvedValue({ conversation: { id: 24 } });
  mockLoadConversations.mockResolvedValue();
  render(<MessageParticipantButton userId={8} name="Анна" />);
  fireEvent.click(screen.getByRole('button', { name: 'Сообщение: Анна' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/messages/c24'));
  expect(api.createConversation).toHaveBeenCalledWith(8);
});

test('several roles are included in the initial application; failure preserves selections', async () => {
  const roles = [1, 2].map((id) => ({ id, titleRu: id === 1 ? 'Фотограф' : 'Помощник', capacity: 3, taken: 0, free: 3 }));
  api.getEvent.mockResolvedValue({ event: { roles, myRoleIds: [] } });
  mockRegister.mockResolvedValueOnce({ ok: false, error: { status: 409, data: { roles } } }).mockResolvedValueOnce({ ok: true });
  render(<RegisterSheet />);
  fireEvent.click(await screen.findByRole('button', { name: /Фотограф/ }));
  fireEvent.click(screen.getByRole('button', { name: /Помощник/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить ответ' }));
  await screen.findByRole('alert');
  expect(mockRegister).toHaveBeenCalledWith('e9', 'yes', [1, 2]);
  expect(mockClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Фотограф/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить ответ' }));
  await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));
});
