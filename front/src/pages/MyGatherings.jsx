import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useSessionStore, useSessionReady } from '../store/useSessionStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { useUiStore } from '../store/useUiStore';
import { useIsDesktop, isOrganizerRole } from '../lib/nav';
import { Container } from '../components/Container';
import Button from '../components/ui/Button';
import { EmptyState, Skeleton } from '../components/ui/feedback';

// Блок «стать организатором» под пустым экраном волонтёра. Показывает ровно одно из
// трёх состояний заявки, потому что действие у них разное: подать / ждать / подать заново.
// request === undefined — ответа сервера ещё нет: молчим, чтобы кнопка не мигала у того,
// у кого заявка уже висит на рассмотрении.
function RoleRequestBlock({ request, isRu, onApply }) {
  if (request === undefined) return null;

  const box = {
    marginTop: 18, padding: 18, borderRadius: 'var(--r-m)',
    border: '1px solid var(--line)', background: 'var(--surface)',
  };
  const head = { fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', margin: '0 0 6px' };
  const text = { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 14px' };

  if (request && request.status === 'pending') {
    return (
      <div style={{ ...box, background: 'var(--maybe-soft)', border: '1px solid var(--maybe)' }}>
        <div style={head}>{isRu ? 'Заявка на рассмотрении' : 'Өтінім қаралуда'}</div>
        <p style={{ ...text, margin: 0 }}>
          {isRu
            ? 'Администратор скоро её посмотрит — решение придёт уведомлением.'
            : 'Әкімші жақын арада қарайды — шешім хабарландырумен келеді.'}
        </p>
      </div>
    );
  }

  // Заявку одобрили, но роль в сессии ещё не догналась (loadMyRoleRequest её тянет).
  // Звать подать заявку человеку, которому её уже одобрили, нельзя — говорим правду.
  if (request && request.status === 'approved') {
    return (
      <div style={{ ...box, background: 'var(--yard-soft)', border: '1px solid var(--yard)' }}>
        <div style={head}>{isRu ? 'Заявка одобрена' : 'Өтінім мақұлданды'}</div>
        <p style={{ ...text, margin: 0 }}>
          {isRu
            ? 'Роль организатора выдана. Обновите страницу, если кнопка создания сбора ещё не появилась.'
            : 'Ұйымдастырушы рөлі берілді. Жиын құру түймесі әлі шықпаса, бетті жаңартыңыз.'}
        </p>
      </div>
    );
  }

  // 'declined' и «заявок не было» отличаются только шапкой: действие в обоих случаях одно.
  const declined = request && request.status === 'declined';
  return (
    <div style={box}>
      <div style={head}>
        {declined
          ? (isRu ? 'Заявка отклонена' : 'Өтінім қабылданбады')
          : (isRu ? 'Хотите проводить свои сборы?' : 'Өз жиындарыңызды өткізгіңіз келе ме?')}
      </div>
      <p style={text}>
        {declined && request.rejectReason
          ? (isRu ? `Причина: ${request.rejectReason}` : `Себебі: ${request.rejectReason}`)
          : isRu
            ? 'Подайте заявку на роль организатора — её рассмотрит администратор.'
            : 'Ұйымдастырушы рөліне өтінім беріңіз — оны әкімші қарайды.'}
      </p>
      <Button icon="users" onClick={onApply}>
        {declined
          ? (isRu ? 'Подать заявку заново' : 'Өтінімді қайта беру')
          : (isRu ? 'Стать организатором' : 'Ұйымдастырушы болу')}
      </Button>
    </div>
  );
}

// Мои сборы: список карточек. Активные сверху, липкая кнопка «Создать».
export default function MyGatherings() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const mine = useGatheringStore((s) => s.myGatherings);
  const loadMine = useGatheringStore((s) => s.loadMine);
  const [loading, setLoading] = useState(true);
  // Создавать сборы может только организатор (бэк: POST /api/gatherings → 403, роут
  // 'new' в ORGANIZER_ROUTES). Экран остаётся открытым волонтёру — своих сборов у него
  // просто нет, — но кнопка «Создать сбор» здесь была бы приглашением в отказ.
  const canCreate = isOrganizerRole(useSessionStore((s) => s.role));
  // Заявка на роль организатора: единственный путь vol → coord. Здесь же и её статус —
  // подавший заявку человек вернётся именно на этот экран проверить, что решили.
  const openSheet = useUiStore((s) => s.openSheet);
  const roleRequest = usePlatformStore((s) => s.myRoleRequest);
  const loadMyRoleRequest = usePlatformStore((s) => s.loadMyRoleRequest);

  // Первая загрузка своих сборов. Пока loadMine не вернулся — держим loading:
  // выдумывать демо-сбор новому организатору нельзя, показываем скелетон.
  // Ждём готовности сессии (см. MyEvents): loggedIn персистится, и без этого
  // страница успевала дёрнуть /gatherings/mine мёртвым токеном до ответа boot().
  const ready = useSessionReady();
  const booted = useSessionStore((s) => s.booted);
  useEffect(() => {
    // booted отличает ожидание от тупика: пока boot() не ответил — скелетон
    // (мигать «сборов нет» и тут же их показывать хуже), после — пустое состояние.
    if (!ready) { if (booted) setLoading(false); return undefined; }
    let alive = true;
    (async () => {
      await loadMine();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, booted, loadMine]);

  // Статус своей заявки — только тому, кому он нужен: организатору её показывать незачем,
  // а гостю эндпоинт под @profiled_required ответил бы 403.
  useEffect(() => { if (ready && !canCreate) loadMyRoleRequest(); }, [ready, canCreate, loadMyRoleRequest]);

  // Активные сверху, завершённые снизу.
  const sorted = [...mine].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));

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
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ padding: '18px 20px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                <Skeleton width="55%" height={18} />
                <Skeleton width="40%" height={14} style={{ marginTop: 10 }} />
                <Skeleton width="70%" height={13} style={{ marginTop: 10 }} />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          canCreate ? (
            <EmptyState icon="calendar" title={t.emptyMe} sub={t.emptyMeSub} action={<Button icon="plus" onClick={() => navigate('/new')}>{t.create}</Button>} />
          ) : (
            // Волонтёру этот экран пуст всегда: здесь сборы, которые ведёшь ты. Вместо
            // приглашения создать сбор (в него он упрётся отказом) даём реальный путь —
            // заявку на роль организатора — и ссылку туда, где лежат ЕГО записи.
            <>
              <EmptyState
                icon="calendar"
                title={isRu ? 'Здесь сборы, которые вы организуете' : 'Мұнда өзіңіз ұйымдастыратын жиындар'}
                sub={isRu
                  ? 'Волонтёр записывается на чужие сборы — они собраны в «Моих мероприятиях».'
                  : 'Волонтёр басқалардың жиынына жазылады — олар «Менің іс-шараларымда».'}
                action={<Button variant="secondary" onClick={() => navigate('/my-events')}>{isRu ? 'Мои мероприятия' : 'Менің іс-шараларым'}</Button>}
              />
              <RoleRequestBlock request={roleRequest} isRu={isRu} onApply={() => openSheet('roleRequest')} />
            </>
          )
        ) : (
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
        )}
      </Container>

      {canCreate && (
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
      )}
    </div>
  );
}
