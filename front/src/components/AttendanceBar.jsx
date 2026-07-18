import { useMemo } from 'react';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useT, useLang } from '../i18n';
import { forecast, counts } from '../lib/forecast';
import { SegTabs } from './ui/controls';

const HATCH = 'repeating-linear-gradient(135deg,rgba(20,24,26,.18) 0,rgba(20,24,26,.18) 2px,transparent 2px,transparent 6px)';
const DOT_HATCH = 'repeating-linear-gradient(135deg,rgba(20,24,26,.2) 0,rgba(20,24,26,.2) 1.5px,transparent 1.5px,transparent 4px)';

// Signature-элемент (ТЗ §3.7): «Полоса явки» — состав людей, а не progress bar.
// Три стиля: compose (сегменты + скоба прогноза), dots (люди), range (диапазон).
// Тап по сегменту/легенде фильтрует список ниже.
export default function AttendanceBar() {
  const participants = useGatheringStore((s) => s.gathering.participants);
  const ctx = useGatheringStore((s) => s.gathering.ctx);
  const displayE = useGatheringStore((s) => s.displayE);
  const barStyle = useUiStore((s) => s.barStyle);
  const setBarStyle = useUiStore((s) => s.setBarStyle);
  const filter = useUiStore((s) => s.filter);
  const setFilter = useUiStore((s) => s.setFilter);
  const t = useT();
  const isRu = useLang() === 'ru';

  const c = useMemo(() => counts(participants), [participants]);
  const f = useMemo(() => forecast(participants, ctx), [participants, ctx]);

  const total = c.total || 1;
  const yesPct = (c.yes / total) * 100;
  const maybePct = (c.maybe / total) * 100;
  const noPct = (c.no / total) * 100;
  const ePct = Math.min(100, (f.E / total) * 100);
  const loPct = Math.max(0, (f.lo / total) * 100);
  const hiPct = Math.min(100, (f.hi / total) * 100);
  const bandLeft = loPct;
  const bandWidth = Math.max(2, hiPct - loPct);
  const dispE = Math.round(displayE == null ? f.E : displayE);
  const roundE = Math.round(f.E);
  const sig = Math.max(1, Math.round(f.sigma));

  const seg = (pct, bg, extra) => ({ border: 'none', cursor: 'pointer', transition: 'width var(--t-move) var(--ease-soft)', minWidth: 2, width: `${pct}%`, background: bg, ...extra });
  const legend = (kind, col) => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 999,
    border: `1px solid ${filter === kind ? col : 'var(--line)'}`, background: filter === kind ? 'var(--surface)' : 'transparent',
    cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)', transition: 'border-color var(--t-fast)',
  });
  const dots = (n, style) =>
    Array.from({ length: n }, (_, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 4, display: 'block', ...style }} />);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{t.barStyleLabel}</span>
        <SegTabs
          value={barStyle}
          onChange={setBarStyle}
          options={[{ value: 'compose', label: t.barCompose }, { value: 'dots', label: t.barDots }, { value: 'range', label: t.barRange }]}
        />
      </div>

      {barStyle === 'compose' && (
        <div style={{ animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
          <div style={{ display: 'flex', height: 48, borderRadius: 'var(--r-s)', overflow: 'hidden', background: 'var(--line)' }}>
            <button aria-label={t.barComing} onClick={() => setFilter('yes')} style={seg(yesPct, 'var(--yard)')} />
            <button aria-label={t.barMaybe} onClick={() => setFilter('maybe')} style={seg(maybePct, 'var(--maybe)', { backgroundImage: HATCH })} />
            <button aria-label={t.barOut} onClick={() => setFilter('no')} style={seg(noPct, 'var(--out)')} />
          </div>
          <div style={{ position: 'relative', height: 26, marginTop: 7 }}>
            <div style={{ position: 'absolute', left: 0, width: `${ePct}%`, height: 6, border: '1.5px dashed var(--yard)', borderBottom: 'none', transition: 'width var(--t-move) var(--ease-soft)' }} />
            <div style={{ position: 'absolute', left: 0, width: `${ePct}%`, top: 10, textAlign: 'center', fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--yard)', transition: 'width var(--t-move) var(--ease-soft)' }}>≈ {dispE} ± {sig}</div>
          </div>
        </div>
      )}

      {barStyle === 'dots' && (
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
      )}

      {barStyle === 'range' && (
        <div style={{ animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
          <div style={{ position: 'relative', height: 48, borderRadius: 'var(--r-s)', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              <div style={{ width: `${yesPct}%`, background: 'var(--yard)', opacity: 0.16, transition: 'width var(--t-move) var(--ease-soft)' }} />
              <div style={{ width: `${maybePct}%`, background: 'var(--maybe)', opacity: 0.14, transition: 'width var(--t-move) var(--ease-soft)' }} />
              <div style={{ width: `${noPct}%`, background: 'var(--out)', opacity: 0.12, transition: 'width var(--t-move) var(--ease-soft)' }} />
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${bandLeft}%`, width: `${bandWidth}%`, background: 'var(--yard-soft)', borderLeft: '2px solid var(--yard)', borderRight: '2px solid var(--yard)', transition: 'left var(--t-move) var(--ease-soft), width var(--t-move) var(--ease-soft)' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${ePct}%`, width: 2, background: 'var(--yard)', transition: 'left var(--t-move) var(--ease-soft)' }} />
            <div style={{ position: 'absolute', left: `${ePct}%`, top: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 19, color: 'var(--yard)', background: 'var(--surface)', padding: '0 5px', borderRadius: 4, transition: 'left var(--t-move) var(--ease-soft)' }}>{dispE}</div>
          </div>
          <div style={{ marginTop: 8, fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.01em' }}>
            {isRu ? `честный диапазон ${Math.round(f.lo)}–${Math.round(f.hi)} · прогноз ≈ ${roundE}` : `шынайы диапазон ${Math.round(f.lo)}–${Math.round(f.hi)} · болжам ≈ ${roundE}`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        <button onClick={() => setFilter('yes')} style={legend('yes', 'var(--yard)')}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--yard)', display: 'block' }} />{t.barComing} · <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.yes}</b>
        </button>
        <button onClick={() => setFilter('maybe')} style={legend('maybe', 'var(--maybe)')}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--maybe)', display: 'block' }} />{t.barMaybe} · <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.maybe}</b>
        </button>
        <button onClick={() => setFilter('no')} style={legend('no', 'var(--out)')}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--out)', display: 'block' }} />{t.barOut} · <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.no}</b>
        </button>
      </div>
    </div>
  );
}
