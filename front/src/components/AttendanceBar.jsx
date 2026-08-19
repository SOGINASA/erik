import { useMemo } from 'react';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useT, useLang } from '../i18n';
import { sourceLabel } from '../lib/forecastView';
import { SegTabs } from './ui/controls';

const HATCH = 'repeating-linear-gradient(135deg,rgba(20,24,26,.18) 0,rgba(20,24,26,.18) 2px,transparent 2px,transparent 6px)';
const DOT_HATCH = 'repeating-linear-gradient(135deg,rgba(20,24,26,.2) 0,rgba(20,24,26,.2) 1.5px,transparent 1.5px,transparent 4px)';

// Signature-элемент (ТЗ §3.7): «Полоса явки» — состав людей, а не progress bar.
//
// Раньше пунктирная скоба прогноза лежала ПОВЕРХ шкалы ответов, а в легенде стояло
// «придут · 14» — счётчик, который читался как прогноз. Теперь два слоя разведены:
// сверху ФАКТ («ответили»), ниже, с зазором и своим заголовком, — ПРОГНОЗ (диапазон
// lo..hi и риска на ожидаемом). В легенде у сегмента два числа: «24 ответили» и
// «≈ 11.1 придут» — одного этого достаточно, чтобы увидеть, что прогноз ≠ счётчик.
//
// Числа берутся из forecastView() (серверная модель), локальный forecast() убран.
// Тап по сегменту/легенде по-прежнему фильтрует список ниже.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r0 = (v) => (num(v) == null ? null : Math.round(v));
const r1 = (v) => (num(v) == null ? null : String(Math.round(v * 10) / 10));
const clamp = (v) => Math.max(0, Math.min(100, v));

export default function AttendanceBar() {
  const serverForecast = useGatheringStore((s) => s.serverForecast);
  const gathering = useGatheringStore((s) => s.gathering);
  const displayE = useGatheringStore((s) => s.displayE);
  const barStyle = useUiStore((s) => s.barStyle);
  const setBarStyle = useUiStore((s) => s.setBarStyle);
  const filter = useUiStore((s) => s.filter);
  const setFilter = useUiStore((s) => s.setFilter);
  const t = useT();
  const isRu = useLang() === 'ru';

  // Тот же приём, что в ForecastBlock: forecastView() на фолбэке отдаёт новый объект,
  // селектором его звать нельзя — useSyncExternalStore зациклит рендер.
  const view = useMemo(
    () => useGatheringStore.getState().forecastView(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverForecast, gathering],
  );

  const c = (view && view.counts) || { yes: 0, maybe: 0, no: 0, total: 0 };
  const total = c.total || 1;
  const yesPct = (c.yes / total) * 100;
  const maybePct = (c.maybe / total) * 100;
  const noPct = (c.no / total) * 100;

  const expected = view ? num(view.expected) : null;
  const lo = view ? num(view.lo) : null;
  const hi = view ? num(view.hi) : null;
  const hasForecast = expected != null;
  const hasBand = hasForecast && lo != null && hi != null;
  const ePct = hasForecast ? clamp((expected / total) * 100) : 0;
  const loPct = hasBand ? clamp((lo / total) * 100) : 0;
  const hiPct = hasBand ? clamp((hi / total) * 100) : 0;
  const bandWidth = Math.max(2, hiPct - loPct);
  const dispE = num(displayE) != null ? Math.round(displayE) : r0(expected);
  const segments = (view && view.segments) || [];
  const segExpected = (a) => {
    const s = segments.find((x) => x.answer === a);
    return s ? num(s.expected) : null;
  };

  // 'range' — стиль про диапазон: полоса прогноза крупная, факт сжат в тонкую строку.
  // В остальных стилях наоборот: факт крупный, прогноз идёт компактной полосой ниже.
  const tall = barStyle === 'range';
  const caption = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)' };
  const src = sourceLabel(view, t);

  const seg = (pct, bg, extra) => ({ border: 'none', cursor: 'pointer', transition: 'width var(--t-move) var(--ease-soft)', minWidth: 2, width: `${pct}%`, background: bg, ...extra });
  const legend = (kind, col) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '9px 13px', borderRadius: 'var(--r-m)',
    border: `1px solid ${filter === kind ? col : 'var(--line)'}`, background: filter === kind ? 'var(--surface)' : 'transparent',
    cursor: 'pointer', textAlign: 'left', transition: 'border-color var(--t-fast)',
  });
  const dots = (n, style) =>
    Array.from({ length: n }, (_, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 4, display: 'block', ...style }} />);

  // Один сегмент фактической полосы (compose/range) — высота задаётся стилем.
  const factSegments = (h) => (
    <div style={{ display: 'flex', height: h, borderRadius: 'var(--r-s)', overflow: 'hidden', background: 'var(--line)' }}>
      <button aria-label={t.barComing} onClick={() => setFilter('yes')} style={seg(yesPct, 'var(--yard)')} />
      <button aria-label={t.barMaybe} onClick={() => setFilter('maybe')} style={seg(maybePct, 'var(--maybe)', { backgroundImage: HATCH })} />
      <button aria-label={t.barOut} onClick={() => setFilter('no')} style={seg(noPct, 'var(--out)')} />
    </div>
  );

  const legendRow = (kind, label, col) => {
    const cnt = c[kind] || 0;
    const exp = segExpected(kind);
    return (
      <button onClick={() => setFilter(kind)} style={legend(kind, col)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--ink-2)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: col, display: 'block' }} />
          {label}
        </span>
        {/* Два числа рядом: слева факт, справа прогноз. Разные подписи, разные цвета —
            «24 ответили» и «≈ 11.1 придут» уже нельзя перепутать. */}
        <span style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, paddingLeft: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--ink-3)' }}>
            <b style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--ink)' }}>{cnt}</b> {t.fcAnswered}
          </span>
          {exp != null && (
            <span style={{ color: col }}>
              ≈ <b style={{ fontFamily: 'var(--fm)', fontWeight: 600 }}>{r1(exp)}</b> {t.fcWillCome}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={caption}>{t.barStyleLabel}</span>
        <SegTabs
          value={barStyle}
          onChange={setBarStyle}
          options={[{ value: 'compose', label: t.barCompose }, { value: 'dots', label: t.barDots }, { value: 'range', label: t.barRange }]}
        />
      </div>

      {/* --- слой 1: ФАКТ. Это ответы, а не предсказание --- */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={caption}>{t.fcAnswered}</span>
        <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{c.total}</span>
      </div>

      {barStyle === 'dots' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
          <button onClick={() => setFilter('yes')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 200, marginBottom: 8 }}>{dots(c.yes, { background: 'var(--yard)' })}</div>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.yes}</b> {t.barComing}</span>
          </button>
          <button onClick={() => setFilter('maybe')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 260, marginBottom: 8 }}>{dots(c.maybe, { background: 'var(--maybe)', backgroundImage: DOT_HATCH })}</div>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}><b style={{ color: 'var(--maybe)', fontWeight: 600 }}>{c.maybe}</b> {t.barMaybe}</span>
          </button>
          <button onClick={() => setFilter('no')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 120, marginBottom: 8 }}>{dots(c.no, { border: '1.5px solid var(--out)' })}</div>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.no}</b> {t.barOut}</span>
          </button>
        </div>
      ) : (
        <div style={{ animation: 'erik-fade var(--t-base) var(--ease-out)' }}>{factSegments(tall ? 12 : 48)}</div>
      )}

      {/* --- слой 2: ПРОГНОЗ. Отдельная полоса, свой заголовок, зазор сверху --- */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <span style={caption}>{t.forecastLabel}</span>
          {/* Источник числа подписан и здесь: полоса прогноза живёт отдельно от блока выше */}
          {src && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{src}</span>}
        </div>

        {!hasForecast ? (
          <div style={{ height: tall ? 48 : 18, borderRadius: 'var(--r-s)', border: '1px dashed var(--line)', background: 'var(--paper)', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: 'var(--ink-3)' }}>
            {t.fcUnavailable}
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', height: tall ? 48 : 18, borderRadius: 'var(--r-s)', background: 'var(--paper)', border: '1px solid var(--line)', overflow: 'hidden', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
              {hasBand && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${loPct}%`, width: `${bandWidth}%`, background: 'var(--yard-soft)', borderLeft: '2px solid var(--yard)', borderRight: '2px solid var(--yard)', transition: 'left var(--t-move) var(--ease-soft), width var(--t-move) var(--ease-soft)' }} />
              )}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${ePct}%`, width: 2, marginLeft: -1, background: 'var(--yard)', transition: 'left var(--t-move) var(--ease-soft)' }} />
              {tall && (
                <div style={{ position: 'absolute', left: `${ePct}%`, top: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 19, color: 'var(--yard)', background: 'var(--surface)', padding: '0 5px', borderRadius: 4, transition: 'left var(--t-move) var(--ease-soft)' }}>{dispE}</div>
              )}
            </div>
            <div style={{ marginTop: 8, fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.01em' }}>
              {hasBand
                ? `${t.fcRange} ${r0(lo)}–${r0(hi)}${!tall ? ` · ${isRu ? 'прогноз' : 'болжам'} ≈ ${r0(expected)}` : ''}`
                : `${isRu ? 'прогноз' : 'болжам'} ≈ ${r0(expected)}`}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
        {legendRow('yes', t.barComing, 'var(--yard)')}
        {legendRow('maybe', t.barMaybe, 'var(--maybe)')}
        {legendRow('no', t.barOut, 'var(--out)')}
      </div>
    </div>
  );
}
