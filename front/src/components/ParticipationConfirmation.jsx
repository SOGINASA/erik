import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n';

export default function ParticipationConfirmation({ eventId, answer }) {
  const ru = useLang() === 'ru';
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true; setState(null); setError('');
    if (eventId) Promise.all([api.getEventRegistration(eventId), api.getEvent(eventId)]).then(([r, e]) => {
      if (alive) setState({ confirmed: r.confirmed, confirmedCount: e.event.confirmedCount, remainingNeeded: e.event.remainingNeeded });
    }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [eventId, answer]);
  const confirm = async () => {
    setBusy(true); setError('');
    try { setState(await api.confirmParticipation(eventId)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  if (!eventId) return null;
  return <section style={{ padding: 16, margin: '16px 0', borderRadius: 12, background: 'var(--yard-soft)' }}>
    {state && <p>{ru ? 'Подтвердили участие' : 'Қатысуын растады'}: {state.confirmedCount || 0} · {ru ? 'Ещё нужны волонтёры' : 'Әлі қажет еріктілер'}: {state.remainingNeeded}</p>}
    {answer === 'yes' && <button type="button" disabled={busy || !state || state.confirmed} onClick={confirm}>{state?.confirmed ? (ru ? 'Участие подтверждено' : 'Қатысу расталды') : (ru ? 'Подтвердить участие' : 'Қатысуды растау')}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
