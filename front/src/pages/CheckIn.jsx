import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { sourceLabel } from '../lib/forecastView';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useIsDesktop } from '../lib/nav';
import { Container } from '../components/Container';
import Avatar from '../components/ui/Avatar';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';

// Отметка явки: экран «на улице». Крупные строки, тап по всей строке. Работает офлайн.
export default function CheckIn() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const { id } = useParams();
  const desktop = useIsDesktop();
  const g = useGatheringStore((s) => s.gathering);
  const loadCoord = useGatheringStore((s) => s.loadCoord);
  const marks = useGatheringStore((s) => s.marks);
  const toggleMark = useGatheringStore((s) => s.toggleMark);

  // При прямом заходе/перезагрузке на /c/:id/check в сторе лежит демо-сбор PARK18 (стор без
  // persist сбрасывается на buildGathering()). Поднимаем настоящий сбор и офлайн-очередь по
  // id из URL — как CoordGathering; иначе отметки шли на демо-id и молча терялись (404).
  useEffect(() => { loadCoord(id); }, [id, loadCoord]);
  const online = useGatheringStore((s) => s.online);
  const syncing = useGatheringStore((s) => s.syncing);
  const pending = useGatheringStore((s) => s.checkinQueue.length);
  const search = useUiStore((s) => s.search);
  const setSearch = useUiStore((s) => s.setSearch);
  const openSheet = useUiStore((s) => s.openSheet);

  // Статус синхронизации отметок (офлайн-first).
  const sync = !online
    ? { dot: 'var(--maybe)', text: isRu ? `Офлайн · ${pending} отметок сохранятся при появлении сети` : `Офлайн · ${pending} белгі желі пайда болғанда сақталады` }
    : syncing
      ? { dot: 'var(--maybe)', text: isRu ? 'Синхронизация…' : 'Синхрондау…' }
      : pending
        ? { dot: 'var(--maybe)', text: t.offlineNote }
        : { dot: 'var(--yard)', text: isRu ? 'Все отметки сохранены' : 'Барлық белгі сақталды' };

  const pool = g.participants.filter((p) => p.answer !== 'no');
  const q = (search || '').trim().toLowerCase();
  const rows = pool.filter((p) => !q || p.name.toLowerCase().includes(q));
  const total = pool.length;
  const markedCount = pool.filter((p) => marks[p.id]).length;

  // Третье число на экране отметки: сколько ждала модель. Сверху факт («отмечено 12 / 38»),
  // под ним предсказание — прогноз и его проверка реальностью стоят в одном кадре.
  // forecastView() при пустом serverForecast собирает НОВЫЙ объект-фолбэк на каждый вызов,
  // а zustand v5 сравнивает снапшот по ссылке (useSyncExternalStore) — подписка самой
  // селектор-функцией дала бы бесконечный ререндер. Подписываемся на входы, вид собираем в useMemo.
  const serverForecast = useGatheringStore((s) => s.serverForecast);
  // deps перечислены руками: forecastView() читает стор через getState(), и линтер не видит,
  // что её настоящие входы — это serverForecast и gathering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => useGatheringStore.getState().forecastView(), [serverForecast, g]);
  // Нет прогноза (view === null или число не приехало) → третьей строки просто нет. Выдумывать нельзя.
  const expected = view && Number.isFinite(view.expected) ? Math.round(view.expected) : null;
  // «модель ждала» — только когда число действительно от модели. Формула и демо
  // подписываются своими словами: молча выдавать оценку за модель запрещено.
  const expLabel = view && view.source === 'model' ? t.fcCheckExpected : (isRu ? 'прогноз ожидал' : 'болжам күткен');
  // Источник подписан всегда. Офлайн-кэш добавляет пометку «прогноз из кэша» К источнику,
  // а не вместо него: sourceLabel при stale возвращает только пометку и источник теряется.
  const srcBase = view ? sourceLabel({ ...view, stale: false }, t) : null;
  const srcLabel = view && view.stale && srcBase ? `${srcBase} · ${t.fcStale}` : srcBase;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(244,245,241,.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}>
        <Container narrow style={{ paddingTop: 12, paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8 }}>
            <button type="button" className="erik-row-hover" onClick={() => navigate(`/c/${g.id}`)} aria-label="Назад" style={{ width: 40, height: 40, marginLeft: -8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}>
              <Icon name="back" size={20} />
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 26, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{markedCount} / {total}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t.markedLabel}</span>
              </div>
              {/* Прогноз — вторым планом и через стрелку, а не через «·» одним кеглем с фактом:
                  между фактом и предсказанием должен читаться переход, а не пара равных чисел. */}
              {expected != null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap', fontSize: 12, lineHeight: 1.3, color: 'var(--ink-3)' }}>
                  <span aria-hidden="true">→</span>
                  <span>{expLabel}</span>
                  <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>≈ {expected}</span>
                  {srcLabel && <span>· {srcLabel}</span>}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px 10px', fontSize: 12, color: 'var(--ink-3)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: sync.dot, display: 'inline-block', animation: syncing ? 'erik-pulse 1.2s var(--ease-soft) infinite' : 'none' }} />{sync.text}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPh}
            /* eslint-disable-next-line jsx-a11y/no-autofocus */
            autoFocus
            className="erik-input"
            style={{ height: 48, padding: '0 16px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', fontSize: 16, width: '100%', outline: 'none' }}
          />
        </Container>
      </div>

      <Container narrow style={{ flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 0 120px' }}>
          {rows.map((p) => {
            const marked = !!marks[p.id];
            return (
              <button
                key={p.id}
                type="button"
                className="erik-btn"
                onClick={() => toggleMark(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, height: 64, padding: '0 16px', borderRadius: 'var(--r-m)',
                  cursor: 'pointer', border: `1px solid ${marked ? 'var(--yard)' : 'var(--line)'}`, background: marked ? 'var(--yard-soft)' : 'var(--surface)',
                  transition: 'background var(--t-fast), border-color var(--t-fast)', textAlign: 'left', width: '100%',
                }}
              >
                <Avatar name={p.name} size={40} />
                <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>{p.name}</span>
                {marked && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--yard)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'erik-pop var(--t-fast) var(--ease-out)' }}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
          <button type="button" className="erik-btn erik-btn-ghost" onClick={() => openSheet('guest')} style={{ height: 52, marginTop: 8, border: 'none', background: 'transparent', color: 'var(--ink-2)', fontWeight: 500, fontSize: 15, cursor: 'pointer', borderRadius: 'var(--r-m)' }}>+ {t.guestBtn}</button>
        </div>
      </Container>

      <div style={{ position: 'sticky', left: 0, right: 0, bottom: desktop ? 0 : 'calc(66px + env(safe-area-inset-bottom))', padding: `14px 0 ${desktop ? 'calc(14px + env(safe-area-inset-bottom))' : '14px'}`, background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
        <Container narrow>
          <Button full size="lg" onClick={() => openSheet('confirm', 'finish')}>{t.finish}</Button>
        </Container>
      </div>
    </div>
  );
}
