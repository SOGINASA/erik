import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { Container } from '../components/Container';
import { EmptyState } from '../components/ui/feedback';
import Button from '../components/ui/Button';
import { THEMES } from '../lib/data';

// Подпись/тон ответа волонтёра.
const ANSWER = {
  yes: { ru: 'Приду', kz: 'Келемін', bg: 'var(--yard-soft)', fg: 'var(--yard)' },
  maybe: { ru: 'Возможно', kz: 'Мүмкін', bg: 'var(--maybe-soft)', fg: 'var(--maybe)' },
  no: { ru: 'Не приду', kz: 'Келмеймін', bg: '#EEF0EC', fg: 'var(--out)' },
};

// «Мои мероприятия» — события, на которые волонтёр записался (RSVP): предстоящие и прошедшие.
export default function MyEvents() {
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const myEvents = usePlatformStore((s) => s.myEvents);
  const loadMyEvents = usePlatformStore((s) => s.loadMyEvents);

  useEffect(() => { loadMyEvents(); }, [loadMyEvents]);

  const upcoming = myEvents.filter((e) => e.status !== 'done');
  const past = myEvents.filter((e) => e.status === 'done');

  const eyebrow = { fontFamily: 'var(--fm)', fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '0 4px 10px' };

  const card = (e) => {
    const a = ANSWER[e.myAnswer] || ANSWER.maybe;
    const theme = THEMES[e.theme] || {};
    const title = isRu ? e.titleRu : e.titleKz;
    const came = e.myPresence === 'came';
    return (
      <button
        key={e.id}
        type="button"
        className="erik-lift"
        onClick={() => navigate('/e/' + e.id)}
        style={{ display: 'flex', gap: 14, width: '100%', textAlign: 'left', padding: 16, borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer' }}
      >
        <span style={{ width: 46, height: 46, flex: 'none', borderRadius: 'var(--r-s)', background: theme.tint || 'var(--paper)', color: theme.ink || 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontWeight: 700 }}>
          {((title || '?')[0] || '?').toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 16, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>{(isRu ? e.dateRu : e.dateKz) || ''}{e.time ? ` · ${e.time}` : ''}</span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRu ? e.placeRu : e.placeKz}</span>
        </span>
        <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ height: 22, padding: '0 10px', display: 'flex', alignItems: 'center', borderRadius: 999, background: a.bg, color: a.fg, fontSize: 12, fontWeight: 600 }}>{isRu ? a.ru : a.kz}</span>
          {e.status === 'done' && (
            <span style={{ fontSize: 11, color: came ? 'var(--yard)' : 'var(--ink-3)' }}>{came ? (isRu ? '✓ был' : '✓ болды') : (isRu ? 'завершено' : 'аяқталды')}</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <Container style={{ maxWidth: 720, paddingTop: 24, paddingBottom: 48 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 6px' }}>{isRu ? 'Мои мероприятия' : 'Менің іс-шараларым'}</h1>
      <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 22px' }}>{isRu ? 'Сборы, на которые вы записались.' : 'Сіз жазылған жиындар.'}</p>

      {myEvents.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={isRu ? 'Вы ещё никуда не записались' : 'Сіз әзірге ешқайда жазылмадыңыз'}
          sub={isRu ? 'Найдите сбор в ленте или на карте и ответьте одним тапом.' : 'Лентадан немесе картадан жиын тауып, бір рет жауап беріңіз.'}
          action={<Button onClick={() => navigate('/feed')}>{isRu ? 'Открыть ленту' : 'Лентаны ашу'}</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {upcoming.length > 0 && (
            <div>
              <div style={eyebrow}>{isRu ? 'Предстоящие' : 'Алдағы'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{upcoming.map(card)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div style={eyebrow}>{isRu ? 'Прошедшие' : 'Өткен'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.72 }}>{past.map(card)}</div>
            </div>
          )}
        </div>
      )}
    </Container>
  );
}
