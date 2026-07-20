import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useIsDesktop } from '../lib/nav';
import { Container } from '../components/Container';
import Button from '../components/ui/Button';

// Мои сборы: список карточек. Активные сверху, липкая кнопка «Создать».
export default function MyGatherings() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const demo = useGatheringStore((s) => s.gathering);
  const mine = useGatheringStore((s) => s.myGatherings);
  const loadMine = useGatheringStore((s) => s.loadMine);

  useEffect(() => { loadMine(); }, [loadMine]);

  // Серверные карточки, иначе — демо-сбор как единственная карточка (офлайн/пусто).
  const list = mine.length
    ? mine
    : [{
        id: demo.id, titleRu: demo.titleRu, titleKz: demo.titleKz,
        dateRu: demo.dateRu, dateKz: demo.dateKz, time: demo.time, status: demo.status,
        came: demo.participants.filter((p) => p.presence === 'came').length,
        answered: demo.participants.filter((p) => p.answer !== 'no').length,
      }];

  // Активные сверху, завершённые снизу.
  const sorted = [...list].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));

  const metaOf = (g) => {
    const answered = g.answered ?? 0;
    const came = g.came ?? 0;
    if (g.status === 'pending') return isRu ? 'ждёт одобрения администратора' : 'әкімшінің мақұлдауын күтуде';
    return g.status === 'done'
      ? isRu ? `пришло ${came} из ${answered}` : `${answered} адамнан ${came} келді`
      : isRu ? `открыт · ответили ${answered}` : `ашық · ${answered} жауап`;
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Container style={{ flex: 1, paddingTop: 16, paddingBottom: 120 }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, letterSpacing: '-.02em', margin: '8px 0 24px' }}>{t.meTitle}</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((g) => {
            const isDone = g.status === 'done';
            const isPending = g.status === 'pending';
            return (
              <button
                key={g.id}
                type="button"
                className="erik-lift"
                onClick={() => navigate(`/c/${g.id}`)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 18, color: 'var(--ink)' }}>{isRu ? g.titleRu : g.titleKz}</span>
                  {isPending
                    ? <span style={{ height: 20, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 999, background: 'var(--maybe-soft)', color: 'var(--maybe)', fontSize: 11, fontWeight: 600 }}>{isRu ? 'на модерации' : 'модерацияда'}</span>
                    : !isDone ? <span style={{ height: 20, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 11, fontWeight: 600 }}>live</span>
                    : null}
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 8 }}>{(isRu ? g.dateRu : g.dateKz)} · {g.time}</div>
                <div style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-3)' }}>{metaOf(g)}</div>
              </button>
            );
          })}
        </div>
      </Container>

      <div
        style={{
          position: 'sticky', left: 0, right: 0,
          bottom: desktop ? 0 : 'calc(66px + env(safe-area-inset-bottom))',
          padding: `14px 0 ${desktop ? 'calc(14px + env(safe-area-inset-bottom))' : '14px'}`,
          background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--line)', zIndex: 20,
        }}
      >
        <Container>
          <Button full size="lg" icon="plus" onClick={() => navigate('/new')}>{t.create}</Button>
        </Container>
      </div>
    </div>
  );
}
