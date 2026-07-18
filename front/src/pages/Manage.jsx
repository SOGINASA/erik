import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useOrganizerStore } from '../store/useOrganizerStore';
import { useIsDesktop } from '../lib/nav';
import { daysFromToday, plural } from '../lib/data';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import ManageHeader from '../components/manage/ManageHeader';
import { StatTile, MiniBar } from '../components/manage/parts';
import { EmptyState } from '../components/ui/feedback';

// Дашборд организатора: сводка, что требует внимания, ближайшие и прошедшие сборы.
export default function Manage() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const events = useOrganizerStore((s) => s.events);
  const load = useOrganizerStore((s) => s.load);
  const forecastFor = useOrganizerStore((s) => s.forecastFor);
  const pending = useOrganizerStore((s) => s.pendingCount());

  useEffect(() => { load(); }, [load]);

  const active = events.filter((e) => e.status !== 'done');
  const past = events.filter((e) => e.status === 'done');

  // Сводка для плиток (считаем локально, чтобы селектор не возвращал новый объект).
  const answered = past.reduce((s, e) => s + e.answered, 0);
  const came = past.reduce((s, e) => s + e.came, 0);
  const stats = {
    active: active.length,
    confirmed: active.reduce((s, e) => s + e.yes, 0),
    attendance: answered ? Math.round((came / answered) * 100) : 0,
    hours: came * 4,
  };

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
      cta: t.remind, onClick: () => navigate(`/c/${e.id}`),
    }));

  const sectionTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '30px 0 12px' };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ flex: 1, paddingTop: 16, paddingBottom: desktop ? 56 : 120 }}>
        <ManageHeader active="overview" />

        {/* Сводка */}
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 12 }}>
          <StatTile value={stats.active} label={t.mgStatActive} />
          <StatTile value={stats.confirmed} label={t.mgStatConfirmed} tone="yard" />
          <StatTile value={`${stats.attendance}%`} label={t.mgStatAttendance} />
          <StatTile value={stats.hours} label={t.mgStatHours} />
        </div>

        {/* Требуют внимания */}
        {attention.length > 0 && (
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

        {/* Ближайшие сборы */}
        <div style={sectionTitle}>{t.mgUpcoming}</div>
        {active.length === 0 ? (
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
        {past.length > 0 && (
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
