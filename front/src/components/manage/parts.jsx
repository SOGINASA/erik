import { useLang } from '../../i18n';
import { skillLabel } from '../../lib/data';

// Плитка сводки: крупное число (display) + подпись-caption.
export function StatTile({ value, label, tone = 'ink', accent }) {
  const color = tone === 'yard' ? 'var(--yard)' : tone === 'maybe' ? 'var(--maybe)' : 'var(--ink)';
  return (
    <div style={{ padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', color, lineHeight: 1 }}>{value}</span>
        {accent && <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-3)' }}>{accent}</span>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>{label}</div>
    </div>
  );
}

// Мини-полоса состава ответов: yard · maybe(штриховка) · out. Перетекает при смене.
export function MiniBar({ yes, maybe, no, height = 8 }) {
  const total = Math.max(1, yes + maybe + no);
  const seg = (flex, bg, extra) => (
    <span style={{ flex: flex || 0.0001, background: bg, ...extra, transition: 'flex var(--t-move) var(--ease-soft)' }} />
  );
  return (
    <span style={{ display: 'flex', width: '100%', height, borderRadius: 999, overflow: 'hidden', background: 'var(--line)' }}>
      {seg(yes / total, 'var(--yard)')}
      {seg(maybe / total, 'var(--maybe)', { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 2px, transparent 2px 6px)' })}
      {seg(no / total, 'var(--out)', { opacity: 0.55 })}
    </span>
  );
}

// Теги навыков волонтёра.
export function SkillTags({ ids = [], max }) {
  const isRu = useLang() === 'ru';
  const list = max ? ids.slice(0, max) : ids;
  const rest = max ? ids.length - list.length : 0;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.map((id) => (
        <span key={id} style={{ height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink-2)', fontSize: 12, whiteSpace: 'nowrap' }}>{skillLabel(id, isRu)}</span>
      ))}
      {rest > 0 && <span style={{ height: 24, display: 'inline-flex', alignItems: 'center', color: 'var(--ink-3)', fontSize: 12 }}>+{rest}</span>}
    </div>
  );
}

// Чип надёжности волонтёра (mono %). Зелёный ≥85, песочный ≥70, нейтральный ниже.
export function RelChip({ value, label }) {
  if (value == null) {
    return <span style={{ height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--maybe-soft)', color: 'var(--maybe)', fontSize: 12, whiteSpace: 'nowrap' }}>{label}</span>;
  }
  const [bg, fg] = value >= 85 ? ['var(--yard-soft)', 'var(--yard)'] : value >= 70 ? ['var(--maybe-soft)', '#8a5a17'] : ['#EEF0EC', 'var(--ink-2)'];
  return (
    <span style={{ height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, background: bg, color: fg, fontSize: 12, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: 'var(--fm)', fontWeight: 600 }}>{value}%</span>{label}
    </span>
  );
}
