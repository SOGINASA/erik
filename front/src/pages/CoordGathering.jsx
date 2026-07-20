import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useIsDesktop } from '../lib/nav';
import { counts } from '../lib/forecast';
import { plural } from '../lib/data';
import { copyToClipboard, shareOrCopy, shareUrlFor } from '../lib/share';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import ForecastBlock from '../components/ForecastBlock';
import AttendanceBar from '../components/AttendanceBar';
import PersonRow from '../components/PersonRow';
import Button from '../components/ui/Button';
import { Skeleton } from '../components/ui/feedback';

// Тот же разбор id, что eventNumericId в useGatheringStore: бэк отдаёт число, лента клеит
// префикс 'e' — 'e5' и 5 это один сбор. null → демо-сбор без серверной пары ('ed1').
const numericId = (v) => {
  const m = /^e?(\d+)$/.exec(String(v == null ? '' : v));
  return m ? m[1] : null;
};

// Дом продукта. Экран координатора — показывается на демо.
export default function CoordGathering() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const { id } = useParams();
  const desktop = useIsDesktop();
  const g = useGatheringStore((s) => s.gathering);
  const loadCoord = useGatheringStore((s) => s.loadCoord);
  const loadMlForecast = useGatheringStore((s) => s.loadMlForecast);
  const animateForecast = useGatheringStore((s) => s.animateForecast);
  const startPoll = useGatheringStore((s) => s.startPoll);
  const stopPoll = useGatheringStore((s) => s.stopPoll);
  const filter = useUiStore((s) => s.filter);
  const openSheet = useUiStore((s) => s.openSheet);
  const showToast = useUiStore((s) => s.showToast);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [retry, setRetry] = useState(0);           // счётчик ручных повторов загрузки
  const want = numericId(id);

  // Грузим сбор по :id, затем число прогноза считается от 0; стартует polling; тянем ML.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    loadCoord(id).finally(() => {
      if (!alive) return;
      // loadCoord глотает ошибку и оставляет в сторе прошлый (или демо) сбор, поэтому
      // о результате судим по id того, что реально легло (как useOrganizerStore.remindFor).
      setStatus(want == null || numericId(useGatheringStore.getState().gathering.id) === want ? 'ready' : 'error');
      animateForecast(true);
      loadMlForecast();
    });
    startPoll();
    return () => {
      alive = false;
      stopPoll();
    };
  }, [id, want, retry, loadCoord, loadMlForecast, animateForecast, startPoll, stopPoll]);

  // Стор стартует с демо-ростера buildGathering(): 45 выдуманных человек с телефонами,
  // код PARK18, дата «сегодня». Пока в сторе не запрошенный сбор, выдавать это за свой
  // состав нельзя — вместо ростера, прогноза и кода скелетон (как booting в Manage).
  const booting = want != null && status !== 'ready' && numericId(g.id) !== want;

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
                {booting ? (
                  <>
                    <Skeleton width={240} height={30} style={{ maxWidth: '100%' }} />
                    <Skeleton width={190} height={14} style={{ marginTop: 10, maxWidth: '100%' }} />
                  </>
                ) : (
                  <>
                    <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.14, letterSpacing: '-.02em', margin: '0 0 6px', textWrap: 'balance' }}>{title}</h1>
                    <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{whenPlace}</div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                {/* Со-координаторы правят один сбор вдвоём — вход в шторку рядом с настройками;
                    payload = id текущего сбора (шторка 'coordinators' тянет по нему ростер). */}
                <button type="button" className="erik-row-hover" onClick={() => openSheet('coordinators', g.id)} disabled={booting} aria-label={t.coCoords} style={{ width: 40, height: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}>
                  <Icon name="users" size={20} stroke={1.7} />
                </button>
                <button type="button" className="erik-row-hover" onClick={() => openSheet('settings')} disabled={booting} aria-label={t.settingsTitle} style={{ width: 40, height: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}>
                  <Icon name="dots" size={22} stroke={0} />
                </button>
              </div>
            </div>

            {/* Честная пометка источника: сбор не пришёл, а на экране лежит демо — молчать нельзя */}
            {booting && status === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 20, borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: 'var(--maybe-soft)', fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>
                <span>{isRu ? 'Не удалось загрузить сбор — попробуйте ещё раз' : 'Жиынды жүктеу мүмкін болмады — қайталап көріңіз'}</span>
                <button type="button" className="erik-btn" onClick={() => setRetry((n) => n + 1)} style={{ flex: 'none', height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{isRu ? 'Повторить' : 'Қайталау'}</button>
              </div>
            )}

            {booting ? (
              <div style={{ marginBottom: 32 }}>
                <Skeleton width={92} height={13} />
                <Skeleton width={132} height={64} style={{ marginTop: 10 }} />
                <Skeleton width={230} height={15} style={{ marginTop: 12, maxWidth: '100%' }} />
                <Skeleton height={48} radius={12} style={{ marginTop: 30 }} />
              </div>
            ) : (
              <>
                <ForecastBlock />
                <AttendanceBar />
              </>
            )}

            {!booting && c.maybe > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '16px 18px', borderRadius: 'var(--r-m)', background: 'var(--maybe-soft)', marginBottom: 28, animation: 'erik-rise var(--t-base) var(--ease-out)' }}>
                <span style={{ fontSize: 14, lineHeight: 1.4, color: '#7a5518' }}>{actionText}</span>
                <button type="button" className="erik-btn" onClick={() => openSheet('remind')} style={{ flex: 'none', height: 40, padding: '0 16px', border: '1px solid var(--maybe)', background: 'var(--surface)', color: '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.remind}</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {booting ? (
                <div>
                  <Skeleton width={130} height={12} style={{ marginBottom: 10 }} />
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px' }}>
                      <Skeleton width={36} height={36} radius={999} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Skeleton width="42%" height={15} />
                        <Skeleton width="60%" height={13} style={{ marginTop: 6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {showComing && coming.length > 0 && group('yes', coming, `${t.groupComing} · ${c.yes}`)}
                  {showMaybe && maybe.length > 0 && group('maybe', maybe, `${t.groupMaybe} · ${c.maybe}`)}
                  {showOut && out.length > 0 && group('no', out, `${t.groupOut} · ${c.no}`)}
                </>
              )}
            </div>

            <div style={{ marginTop: 28, padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>{t.linkLabel}</div>
                {/* Код чужого демо-сбора (PARK18) скопировали бы как ссылку на свой — только скелетон */}
                <div style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 17, letterSpacing: '.08em', color: 'var(--ink)' }}>{booting ? <Skeleton width={92} height={17} /> : g.code}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flex: 'none', visibility: booting ? 'hidden' : 'visible' }}>
                <button type="button" className="erik-btn erik-btn-secondary" onClick={async () => { await copyToClipboard(shareUrlFor(g.code)); showToast(isRu ? 'Ссылка скопирована' : 'Сілтеме көшірілді'); }} style={{ height: 40, padding: '0 14px', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.copy}</button>
                <button type="button" className="erik-btn erik-btn-secondary" onClick={async () => { const r = await shareOrCopy({ title: isRu ? g.titleRu : g.titleKz, text: `«${isRu ? g.titleRu : g.titleKz}»`, url: shareUrlFor(g.code) }); if (r === 'copied') showToast(isRu ? 'Ссылка скопирована' : 'Сілтеме көшірілді'); }} aria-label={t.share} style={{ width: 40, height: 40, border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-s)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>
                  <Icon name="share" size={17} stroke={1.6} />
                </button>
              </div>
            </div>
          </div>

          {desktop && (
            <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Пока сбор не пришёл, g.id и g.code — от демо: отметка явки и ссылка ушли бы не туда */}
              <Button size="lg" disabled={booting} onClick={() => navigate(`/c/${g.id}/check`)}>{t.markAttendance}</Button>
              <Button variant="secondary" disabled={booting} onClick={() => openSheet('remind')}>{t.remindWavering}</Button>
              <Button variant="secondary" disabled={booting} onClick={async () => { await copyToClipboard(shareUrlFor(g.code)); showToast(isRu ? 'Ссылка скопирована' : 'Сілтеме көшірілді'); }}>{t.copyLink}</Button>
            </div>
          )}
        </div>
      </Container>

      {!desktop && (
        <div style={{ position: 'sticky', bottom: 'calc(66px + env(safe-area-inset-bottom))', left: 0, right: 0, padding: '14px 0', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
          <Container>
            <Button full size="lg" disabled={booting} onClick={() => navigate(`/c/${g.id}/check`)}>{t.markAttendance}</Button>
          </Container>
        </div>
      )}
    </div>
  );
}
