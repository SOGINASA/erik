import { useMemo } from 'react';
import { useGatheringStore } from '../store/useGatheringStore';
import { useT, useLang } from '../i18n';
import { forecast } from '../lib/forecast';
import { plural } from '../lib/data';

// Блок прогноза: подпись, крупное число (анимируется счётом), ± σ и строка нормы.
export default function ForecastBlock() {
  const participants = useGatheringStore((s) => s.gathering.participants);
  const ctx = useGatheringStore((s) => s.gathering.ctx);
  const needed = useGatheringStore((s) => s.gathering.needed);
  const displayE = useGatheringStore((s) => s.displayE);
  const ml = useGatheringStore((s) => s.mlForecast);
  const t = useT();
  const isRu = useLang() === 'ru';

  const f = useMemo(() => forecast(participants, ctx), [participants, ctx]);
  const dispE = Math.round(displayE == null ? f.E : displayE);
  const roundE = Math.round(f.E);
  const sig = Math.max(1, Math.round(f.sigma));
  const enough = roundE >= needed;
  const short = Math.max(0, needed - roundE);
  const subline = enough
    ? isRu ? `Нужно ${needed} · прогноз выше нормы` : `${needed} керек · болжам нормадан жоғары`
    : isRu ? `Нужно ${needed} · не хватит ${short} ${plural(short, ['человека', 'человек', 'человек'])}` : `${needed} керек · ${short} адам жетпейді`;
  const color = enough ? 'var(--yard)' : 'var(--maybe)';

  return (
    <div style={{ marginBottom: 32, animation: 'erik-rise var(--t-move) var(--ease-out)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 13, letterSpacing: '.01em', color: 'var(--ink-3)' }}>{t.forecastLabel}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-3)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--yard)', display: 'inline-block', animation: 'erik-pulse 1.6s var(--ease-soft) infinite' }} />
          live
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 64, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{dispE}</span>
        <span style={{ fontFamily: 'var(--fm)', fontWeight: 500, fontSize: 18, color: 'var(--ink-2)' }}>± {sig}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 15, fontWeight: 500, color }}>{subline}</div>

      {/* Компаньон ML-модели — второе, обучаемое мнение. Подчинён главному числу. */}
      {ml && ml.available && (
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--fm)', fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 4px' }}>ML</span>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            {isRu ? 'модель оценивает ≈ ' : 'модель бағалауы ≈ '}
            <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--ink)' }}>{Math.round(ml.expected)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
