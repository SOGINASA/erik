import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useIsDesktop } from '../lib/nav';
import { counts } from '../lib/forecast';
import { plural } from '../lib/data';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import ForecastBlock from '../components/ForecastBlock';
import AttendanceBar from '../components/AttendanceBar';
import PersonRow from '../components/PersonRow';
import Button from '../components/ui/Button';

// Дом продукта. Экран координатора — показывается на демо.
export default function CoordGathering() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const { id } = useParams();
  const desktop = useIsDesktop();
  const g = useGatheringStore((s) => s.gathering);
  const loadCoord = useGatheringStore((s) => s.loadCoord);
  const animateForecast = useGatheringStore((s) => s.animateForecast);
  const startPoll = useGatheringStore((s) => s.startPoll);
  const stopPoll = useGatheringStore((s) => s.stopPoll);
  const filter = useUiStore((s) => s.filter);
  const openSheet = useUiStore((s) => s.openSheet);
  const showToast = useUiStore((s) => s.showToast);

  // Грузим сбор по :id, затем число прогноза считается от 0; стартует polling.
  useEffect(() => {
    let alive = true;
    loadCoord(id).finally(() => {
      if (alive) animateForecast(true);
    });
    startPoll();
    return () => {
      alive = false;
      stopPoll();
    };
  }, [id, loadCoord, animateForecast, startPoll, stopPoll]);

  const c = counts(g.participants);
  const title = isRu ? g.titleRu : g.titleKz;
  const whenPlace = `${isRu ? g.dateRu : g.dateKz} · ${g.time} · ${isRu ? g.placeRu : g.placeKz}`;

  const histText = (p) =>
    p.history.total > 0
      ? isRu ? `был ${p.history.came} из ${p.history.total} раз` : `${p.history.total} реттен ${p.history.came} рет келген`
      : t.newParticipant;
  const statusChip = (kind) => {
    const map = { yes: [t.statusYes, 'var(--yard-soft)', 'var(--yard)'], maybe: [t.statusMaybe, 'var(--maybe-soft)', '#8a5a17'], no: [t.statusNo, '#EEF0EC', 'var(--ink-2)'] };
    const [label, bg, color] = map[kind];
    return <span style={{ flex: 'none', height: 24, padding: '0 10px', display: 'flex', alignItems: 'center', borderRadius: 999, background: bg, color, fontSize: 12, letterSpacing: '.01em' }}>{label}</span>;
  };

  const openPerson = (p) => openSheet('person', p);
  const group = (kind, list, label) => (
    <div>
      <div style={{ fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {list.map((p) => (
          <PersonRow key={p.id} name={p.name} historyText={histText(p)} right={statusChip(kind)} dim={kind === 'no'} onClick={() => openPerson(p)} />
        ))}
      </div>
    </div>
  );

  const coming = g.participants.filter((p) => p.answer === 'yes');
  const maybe = g.participants.filter((p) => p.answer === 'maybe');
  const out = g.participants.filter((p) => p.answer === 'no');
  const showComing = !filter || filter === 'yes';
  const showMaybe = !filter || filter === 'maybe';
  const showOut = !filter || filter === 'no';

  const actionText = isRu
    ? `${c.maybe} ${plural(c.maybe, ['человек', 'человека', 'человек'])}${c.maybe % 10 === 1 && c.maybe % 100 !== 11 ? ' не определился. Напомнить ему?' : ' не определились. Напомнить им?'}`
    : `${c.maybe} адам шешпеген. Еске салайық па?`;

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ paddingTop: 16 }}>
        <div style={{ display: desktop ? 'grid' : 'block', gridTemplateColumns: '1fr 320px', gap: 44, alignItems: 'start', paddingBottom: desktop ? 56 : 96 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, margin: '8px 0 28px' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.14, letterSpacing: '-.02em', margin: '0 0 6px', textWrap: 'balance' }}>{title}</h1>
                <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{whenPlace}</div>
              </div>
              <button type="button" className="erik-row-hover" onClick={() => openSheet('settings')} aria-label={t.settingsTitle} style={{ width: 40, height: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}>
                <Icon name="dots" size={22} stroke={0} />
              </button>
            </div>

            <ForecastBlock />
            <AttendanceBar />

            {c.maybe > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '16px 18px', borderRadius: 'var(--r-m)', background: 'var(--maybe-soft)', marginBottom: 28, animation: 'erik-rise var(--t-base) var(--ease-out)' }}>
                <span style={{ fontSize: 14, lineHeight: 1.4, color: '#7a5518' }}>{actionText}</span>
                <button type="button" className="erik-btn" onClick={() => openSheet('remind')} style={{ flex: 'none', height: 40, padding: '0 16px', border: '1px solid var(--maybe)', background: 'var(--surface)', color: '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.remind}</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {showComing && coming.length > 0 && group('yes', coming, `${t.groupComing} · ${c.yes}`)}
              {showMaybe && maybe.length > 0 && group('maybe', maybe, `${t.groupMaybe} · ${c.maybe}`)}
              {showOut && out.length > 0 && group('no', out, `${t.groupOut} · ${c.no}`)}
            </div>

            <div style={{ marginTop: 28, padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>{t.linkLabel}</div>
                <div style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 17, letterSpacing: '.08em', color: 'var(--ink)' }}>{g.code}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                <button type="button" className="erik-btn erik-btn-secondary" onClick={() => showToast(isRu ? 'Ссылка скопирована' : 'Сілтеме көшірілді')} style={{ height: 40, padding: '0 14px', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.copy}</button>
                <button type="button" className="erik-btn erik-btn-secondary" onClick={() => showToast(isRu ? 'Открыто меню «Поделиться»' : '«Бөлісу» мәзірі ашылды')} aria-label={t.share} style={{ width: 40, height: 40, border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-s)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>
                  <Icon name="share" size={17} stroke={1.6} />
                </button>
              </div>
            </div>
          </div>

          {desktop && (
            <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button size="lg" onClick={() => navigate(`/c/${g.id}/check`)}>{t.markAttendance}</Button>
              <Button variant="secondary" onClick={() => openSheet('remind')}>{t.remindWavering}</Button>
              <Button variant="secondary" onClick={() => showToast(isRu ? 'Ссылка скопирована' : 'Сілтеме көшірілді')}>{t.copyLink}</Button>
            </div>
          )}
        </div>
      </Container>

      {!desktop && (
        <div style={{ position: 'sticky', bottom: 'calc(66px + env(safe-area-inset-bottom))', left: 0, right: 0, padding: '14px 0', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
          <Container>
            <Button full size="lg" onClick={() => navigate(`/c/${g.id}/check`)}>{t.markAttendance}</Button>
          </Container>
        </div>
      )}
    </div>
  );
}
