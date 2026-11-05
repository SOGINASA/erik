import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReviewDialog from './ReviewDialog';
import { api } from '../lib/api';
jest.mock('../lib/api', () => ({ api: { reviewHistory: jest.fn() } }));
jest.mock('../i18n', () => ({ useLang: () => 'ru' }));
jest.mock('./ui/Sheet', () => ({ Sheet: ({ children }) => <div role="dialog">{children}</div> }));

const history = { submissions: [{ revision: 3, submittedAt: '2026-11-05T10:00:00Z', details: { answers: {
  motivation: 'Хочу помогать', experience: 'Волонтёрский опыт', plannedContribution: 'Организую уборки' } }, decisions: [] }] };
function fillReview() {
  fireEvent.change(screen.getByLabelText('Основание решения'), { target: { value: 'complete_and_valid' } });
  ['Мотивация', 'Опыт и готовность организовывать', 'Планы работы с волонтёрами'].forEach((label) => fireEvent.change(screen.getByLabelText(label), { target: { value: 'passed' } }));
  fireEvent.change(screen.getByLabelText('Уверенность в решении'), { target: { value: 'certain' } });
}
beforeEach(() => { jest.clearAllMocks(); api.reviewHistory.mockResolvedValue(history); });

test('binds decision to the actual loaded version and requires explicit checks', async () => {
  const onDecision = jest.fn().mockResolvedValue({}); const onClose = jest.fn();
  render(<ReviewDialog kind="organizer_role" sourceId={9} onDecision={onDecision} onClose={onClose} />);
  const approve = screen.getByRole('button', { name: 'Одобрить' });
  expect(approve).toBeDisabled();
  await screen.findByText('Хочу помогать');
  expect(approve).toBeDisabled();
  fillReview(); fireEvent.click(approve);
  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('approved', expect.objectContaining({ review: expect.objectContaining({
    submissionRevision: 3, reasonCode: 'complete_and_valid', certainty: 'certain', checks: { motivation: 'passed', experience: 'passed', scope: 'passed' } }) })));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('failed evidence load never permits an unbound decision', async () => {
  api.reviewHistory.mockRejectedValue(new Error('offline'));
  const onDecision = jest.fn();
  render(<ReviewDialog kind="organizer_role" sourceId={9} onDecision={onDecision} onClose={jest.fn()} />);
  await screen.findByRole('alert'); fillReview();
  expect(screen.getByRole('button', { name: 'Одобрить' })).toBeDisabled();
  expect(onDecision).not.toHaveBeenCalled();
});

test('stale or failed decision keeps the form and does not report success', async () => {
  const onClose = jest.fn(); const onDecision = jest.fn().mockRejectedValue(new Error('Заявка изменилась во время проверки'));
  render(<ReviewDialog kind="organizer_role" sourceId={9} onDecision={onDecision} onClose={onClose} />);
  await screen.findByText('Хочу помогать'); fillReview();
  fireEvent.click(screen.getByRole('button', { name: 'Одобрить' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Заявка изменилась во время проверки');
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Основание решения')).toHaveValue('complete_and_valid');
});
