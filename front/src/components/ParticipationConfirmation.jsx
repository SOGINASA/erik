import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { useSessionStore } from '../store/useSessionStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { useGatheringStore } from '../store/useGatheringStore';
import Button from './ui/Button';
import './Community.css';

function publish(eventId, next) {
  const stats = { confirmedCount: next.confirmedCount, remainingNeeded: next.remainingNeeded, myConfirmed: next.confirmed };
  usePlatformStore.getState().patchEventConfirmation('e' + eventId, stats);
  const current = useGatheringStore.getState().gathering;
  if (current && String(current.id) === String(eventId)) {
    useGatheringStore.setState({ gathering: { ...current, ...stats } });
  }
}

export default function ParticipationConfirmation({ eventId, answer }) {
  const ru = useLang() === 'ru';
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const token = useSessionStore((s) => s.token);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const requestId = ++generation.current;
    setState(null); setError(''); setBusy(false);
    if (!eventId) return undefined;
    // The public event already includes the viewer's confirmation. Guests don't
    // need an authenticated registration request just to read the remaining count.
    api.getEvent(eventId).then(({ event }) => {
      if (generation.current !== requestId) return;
      const next = { confirmed: !!event.myConfirmed, confirmedCount: event.confirmedCount, remainingNeeded: event.remainingNeeded, status: event.status };
      setState(next); publish(eventId, next);
    }).catch((err) => { if (generation.current === requestId) setError(err.message); });
    return () => { generation.current += 1; };
  }, [eventId, answer, token, retry]);
  const confirm = async () => {
    if (busy) return;
    const requestId = generation.current;
    setBusy(true); setError('');
    try {
      const next = await api.confirmParticipation(eventId);
      if (generation.current !== requestId) return;
      setState((prev) => ({ ...prev, ...next })); publish(eventId, next);
    } catch (err) { if (generation.current === requestId) setError(err.message); }
    finally { if (generation.current === requestId) setBusy(false); }
  };
  if (!eventId) return null;
  return <section className="community-confirm" aria-label={ru ? 'Подтверждение участия' : 'Қатысуды растау'}>
    {state ? <div className="community-confirm-stats" aria-live="polite"><div><strong>{state.confirmedCount ?? 0}</strong><span>{ru ? 'подтвердили участие' : 'қатысуын растады'}</span></div><div><strong>{state.remainingNeeded ?? '—'}</strong><span>{ru ? 'ещё нужны волонтёры' : 'әлі қажет волонтёрлер'}</span></div></div>
      : !error && <p role="status">{ru ? 'Уточняем состав команды…' : 'Команда құрамын нақтылаймыз…'}</p>}
    {loggedIn && answer === 'yes' && state?.status === 'open' && <>
      <p>{state.confirmed ? (ru ? 'Координатор знает, что вы планируете прийти. Если планы изменятся, измените ответ на событие.' : 'Үйлестіруші келетініңізді біледі. Жоспарыңыз өзгерсе, жауабыңызды өзгертіңіз.') : (ru ? 'Уверены, что придёте? Подтвердите участие, чтобы координатор мог рассчитывать на вас.' : 'Келетініңізге сенімдісіз бе? Үйлестіруші сізге сенуі үшін қатысуды растаңыз.')}</p>
      <Button loading={busy} disabled={state.confirmed} icon={state.confirmed ? 'check' : undefined} onClick={confirm}>{state.confirmed ? (ru ? 'Участие подтверждено' : 'Қатысу расталды') : (ru ? 'Подтвердить участие' : 'Қатысуды растау')}</Button>
    </>}
    {error && <div role="alert" className="community-error">{error}{!state && <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>{ru ? 'Повторить' : 'Қайталау'}</Button>}</div>}
  </section>;
}
