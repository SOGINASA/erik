import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useOrganizerStore, orgNotice } from '../store/useOrganizerStore';
import { useSessionStore } from '../store/useSessionStore';
import { useIsDesktop } from '../lib/nav';
import { daysFromToday, plural } from '../lib/data';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import ManageHeader from '../components/manage/ManageHeader';
import { StatTile, MiniBar } from '../components/manage/parts';
import { EmptyState, Skeleton } from '../components/ui/feedback';

// Дашборд организатора: сводка, что требует внимания, ближайшие и прошедшие сборы.
export default function Manage() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const events = useOrganizerStore((s) => s.events);
  const load = useOrganizerStore((s) => s.load);
  const loadAnalytics = useOrganizerStore((s) => s.loadAnalytics);
  const remindFor = useOrganizerStore((s) => s.remindFor);
  const resubmit = useOrganizerStore((s) => s.resubmit);
  const forecastFor = useOrganizerStore((s) => s.forecastFor);
  const pending = useOrganizerStore((s) => s.pendingCount());
  const source = useOrganizerStore((s) => s.source);
  const status = useOrganizerStore((s) => s.status);
  const analytics = useOrganizerStore((s) => s.analytics);
  const analyticsStatus = useOrganizerStore((s) => s.analyticsStatus);
  const loggedIn = useSessionStore((s) => s.loggedIn);

  // Аналитика имеет смысл только на серверных данных — грузим её после load().
  useEffect(() => { load().then(loadAnalytics); }, [load, loadAnalytics]);

  // Первая загрузка: показывать моки как свои цифры нельзя, вместо них скелетон.
  const booting = status === 'loading' && source === 'demo';
  const notice = orgNotice(source, status, isRu, loggedIn);

  const active = events.filter((e) => e.status !== 'done' && e.status !== 'rejected');
  const rejected = events.filter((e) => e.status === 'rejected');
  const past = events.filter((e) => e.status === 'done');

  // Сводка для плиток (считаем локально, чтобы селектор не возвращал новый объект).
  // Первые три величины выводятся из тех же сборов, что показаны ниже, — они честны
  // и на демо; с сервера берём их же, когда аналитика пришла.
  const answered = past.reduce((s, e) => s + e.answered, 0);
  const came = past.reduce((s, e) => s + e.came, 0);
  const stats = {
    active: analytics ? analytics.activeGatherings : active.length,
    confirmed: analytics ? analytics.confirmedTotal : active.reduce((s, e) => s + e.yes, 0),
    attendance: analytics ? analytics.attendancePct : answered ? Math.round((came / answered) * 100) : 0,
  };
  // Часы из сборов не выводятся (раньше стояло came × 4 — выдуманное число).
  // Настоящие — только из аналитики; пока их нет, честнее скелетон и прочерк.
  const hoursTile = analytics
    ? analytics.hoursTotal
    : analyticsStatus === 'loading' || booting
      ? <Skeleton width={54} height={26} />
      : '—';

  // Метка срока сбора.
  const whenTag = (e) => {
    if (e.status === 'live') return { label: t.mgLiveTag, bg: 'var(--yard-soft)', color: 'var(--yard)' };
    const d = daysFromToday(e.dateISO);
    const label = d <= 0 ? t.mgLiveTag : d === 1 ? (isRu ? 'завтра' : 'ертең') : (isRu ? `через ${d} ${plural(d, ['день', 'дня', 'дней'])}` : `${d} күннен кейін`);
    return { label, bg: 'var(--paper)', color: 'var(--ink-2)' };
  };

  // Что требует внимания: заявки + сборы с наибольшей неопределённостью.
  const attention = [];
  if (pending > 0) {
    attention.push({
      key: 'apps', tone: 'apps',
      text: `${pending} ${isRu ? plural(pending, ['новая заявка', 'новые заявки', 'новых заявок']) + ' волонтёров' : t.mgAttApps}`,
      cta: t.mgReview, onClick: () => navigate('/manage/requests'),
    });
  }
  active
    .filter((e) => e.maybe > 0)
    .sort((a, b) => b.maybe - a.maybe)
    .slice(0, 2)
    .forEach((e) => attention.push({
      key: e.id, tone: 'maybe',
      text: `«${isRu ? e.titleRu : e.titleKz}»: ${e.maybe} ${isRu ? plural(e.maybe, ['человек', 'человека', 'человек']) : ''} ${t.mgAttMaybe}`,
      cta: t.remind, onClick: () => remindFor(e.id),
    }));

  const sectionTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '30px 0 12px' };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ flex: 1, paddingTop: 16, paddingBottom: desktop ? 56 : 120 }}>
        <ManageHeader active="overview" />

        {/* Честная пометка источника: демо-данные и ошибка загрузки видны, а не молчат */}
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: notice.tone === 'error' ? 'var(--maybe-soft)' : 'var(--paper)', fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>
            <span>{notice.text}</span>
            {notice.retry && (
              <button type="button" className="erik-btn" onClick={() => load().then(loadAnalytics)} style={{ flex: 'none', height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{isRu ? 'Повторить' : 'Қайталау'}</button>
            )}
          </div>
        )}

        {/* Сводка */}
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 12 }}>
          {booting ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} style={{ padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
                <Skeleton width={54} height={26} />
                <Skeleton width="70%" height={12} style={{ marginTop: 12 }} />
              </div>
            ))
          ) : (
            <>
              <StatTile value={stats.active} label={t.mgStatActive} />
              <StatTile value={stats.confirmed} label={t.mgStatConfirmed} tone="yard" />
              <StatTile value={`${stats.attendance}%`} label={t.mgStatAttendance} />
              <StatTile value={hoursTile} label={t.mgStatHours} />
            </>
          )}
        </div>

        {/* Пока идёт первая загрузка — скелетон вместо демо-сборов */}
        {booting && (
          <>
            <div style={sectionTitle}>{t.mgUpcoming}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <Skeleton width="55%" height={18} />
                  <Skeleton width="75%" height={13} style={{ marginTop: 8 }} />
                  <Skeleton height={8} radius={999} style={{ marginTop: 14 }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Требуют внимания */}
        {!booting && attention.length > 0 && (
          <>
            <div style={sectionTitle}>{t.mgAttention}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {attention.map((a) => (
                <div key={a.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 18px', borderRadius: 'var(--r-m)', background: a.tone === 'apps' ? 'var(--yard-soft)' : 'var(--maybe-soft)', animation: 'erik-rise var(--t-base) var(--ease-out)' }}>
                  <span style={{ fontSize: 14, lineHeight: 1.4, color: a.tone === 'apps' ? '#255a40' : '#7a5518' }}>{a.text}</span>
                  <button type="button" className="erik-btn" onClick={a.onClick} style={{ flex: 'none', height: 38, padding: '0 16px', border: `1px solid ${a.tone === 'apps' ? 'var(--yard)' : 'var(--maybe)'}`, background: 'var(--surface)', color: a.tone === 'apps' ? 'var(--yard)' : '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{a.cta}</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Отклонённые модерацией — с причиной и кнопкой «Пересдать» */}
        {!booting && rejected.length > 0 && (
          <>
            <div style={sectionTitle}>{t.mgRejected}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rejected.map((e) => (
                <div key={e.id} style={{ padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--maybe)', background: 'var(--maybe-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', lineHeight: 1.2 }}>{isRu ? e.titleRu : e.titleKz}</div>
                      <div style={{ fontSize: 13, color: '#8a5a17', marginTop: 4 }}>{t.mgRejectedTag}</div>
                    </div>
                    <button type="button" className="erik-btn" onClick={() => resubmit(e.id)} style={{ flex: 'none', height: 38, padding: '0 16px', border: '1px solid var(--maybe)', background: 'var(--surface)', color: '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.mgResubmit}</button>
                  </div>
                  {e.rejectReason && (
                    <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>
                      <span style={{ color: 'var(--ink-3)' }}>{t.mgRejectReason}: </span>{e.rejectReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ближайшие сборы */}
        {!booting && <div style={sectionTitle}>{t.mgUpcoming}</div>}
        {booting ? null : active.length === 0 ? (
          <EmptyState icon="calendar" title={t.emptyMe} sub={t.emptyMeSub} action={<Button icon="plus" onClick={() => navigate('/new')}>{t.create}</Button>} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map((e) => {
              const f = forecastFor(e);
              const tag = whenTag(e);
              const enough = f.E >= e.needed;
              return (
                <button
                  key={e.id}
                  type="button"
                  className="erik-lift"
                  onClick={() => navigate(`/c/${e.id}`)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', lineHeight: 1.2 }}>{isRu ? e.titleRu : e.titleKz}</span>
                    <span style={{ flex: 'none', height: 22, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: tag.bg, color: tag.color, fontSize: 12, fontWeight: 500 }}>{tag.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>{(isRu ? e.dateRu : e.dateKz)} · {e.time} · {isRu ? e.placeRu : e.placeKz}</div>

                  <MiniBar yes={e.yes} maybe={e.maybe} no={e.no} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
                    <span style={{ color: enough ? 'var(--yard)' : 'var(--maybe)', fontWeight: 500 }}>
                      {t.mgForecastShort} ≈ <span style={{ fontFamily: 'var(--fm)', fontWeight: 600 }}>{f.E}</span> {isRu ? 'из' : 'ішінен'} {e.needed}
                    </span>
                    <span style={{ color: 'var(--ink-3)' }}>·</span>
                    <span style={{ color: 'var(--ink-2)' }}><span style={{ fontFamily: 'var(--fm)' }}>{e.yes}</span> {t.mgConfirmedShort}</span>
                    <span style={{ color: 'var(--ink-3)' }}>·</span>
                    <span style={{ color: 'var(--ink-2)' }}><span style={{ fontFamily: 'var(--fm)' }}>{e.maybe}</span> {t.mgMaybeShort}</span>
                    {e.applied > 0 && (
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 12, fontWeight: 500 }}>
                        <Icon name="users" size={13} stroke={1.8} />{e.applied} {isRu ? plural(e.applied, ['заявка', 'заявки', 'заявок']) : 'өтінім'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Прошедшие сборы */}
        {!booting && past.length > 0 && (
          <>
            <div style={sectionTitle}>{t.mgPast}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {past.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRu ? e.titleRu : e.titleKz}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{isRu ? e.dateRu : e.dateKz}</div>
                  </div>
                  <div style={{ flex: 'none', fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-2)' }}>
                    {isRu ? `пришло ${e.came} из ${e.answered}` : `${e.answered} ішінен ${e.came} келді`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Container>

      {/* Мобильная липкая кнопка создания */}
      {!desktop && (
        <div style={{ position: 'sticky', left: 0, right: 0, bottom: 'calc(66px + env(safe-area-inset-bottom))', padding: '14px 0', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
          <Container>
            <Button full size="lg" icon="plus" onClick={() => navigate('/new')}>{t.create}</Button>
          </Container>
        </div>
      )}
    </div>
  );
}
