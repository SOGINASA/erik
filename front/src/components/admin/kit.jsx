import Icon from '../Icon';

// Общий набор компонентов админ-панели erik. Все секции строятся на нём —
// единый визуальный язык (токены, типографика, отступы).

// Карточка метрики: заголовок, крупное число, подпись/дельта, иконка.
export function StatCard({ label, value, sub, subTone = 'ink-2', accent = 'var(--yard)', tint = 'var(--yard-soft)', icon }) {
  return (
    <div style={{ padding: 18, borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{label}</span>
        {icon && (
          <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: tint, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-.02em', color: 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: `var(--${subTone})`, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// Титулованная карточка-контейнер для блоков секции.
export function SectionCard({ title, right, children, pad = 16, style }) {
  return (
    <div style={{ borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

// Горизонтальный мини-бар-чарт: data = [{ label, value, color }].
export function MiniBars({ data, unit = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 116, flex: 'none', fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
          <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.value / max) * 100}%`, background: d.color || 'var(--yard)', borderRadius: 999, transition: 'width var(--t-move) var(--ease-soft)' }} />
          </div>
          <span style={{ width: 52, flex: 'none', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink)' }}>{d.value.toLocaleString('ru-RU')}{unit}</span>
        </div>
      ))}
    </div>
  );
}

// Кольцо прогресса (SVG) для процентов/долей.
export function Ring({ value, size = 92, stroke = 9, color = 'var(--yard)', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value / 100)));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset var(--t-move) var(--ease-soft)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>{Math.round(value)}%</span>
        {label && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>}
      </div>
    </div>
  );
}

// Цветной статус-пилл.
const PILL = {
  yard: ['var(--yard-soft)', 'var(--yard)'],
  maybe: ['var(--maybe-soft)', '#8a5a17'],
  out: ['#EEF0EC', 'var(--ink-2)'],
  danger: ['#F7E4E2', 'var(--danger)'],
  blue: ['#E4EAEE', '#3d5566'],
};
export function StatusPill({ tone = 'yard', icon, children }) {
  const [bg, color] = PILL[tone] || PILL.yard;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 9px', borderRadius: 999, background: bg, color, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

// Таблица со скроллом по горизонтали на узких экранах.
// head = [{ label, align }]. Строки — <Tr>/<Td> ниже.
export function Table({ head, children }) {
  return (
    <div className="erik-scroll" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: h.align || 'left', padding: '10px 12px', fontSize: 11, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 500, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Tr({ children, onClick, style }) {
  return (
    <tr className={onClick ? 'erik-row-hover' : undefined} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', ...style }}>
      {children}
    </tr>
  );
}
export function Td({ children, align, nowrap, style }) {
  return (
    <td style={{ padding: '11px 12px', borderBottom: '1px solid var(--line)', textAlign: align || 'left', color: 'var(--ink)', whiteSpace: nowrap ? 'nowrap' : undefined, ...style }}>
      {children}
    </td>
  );
}

// Поиск для секций.
export function AdminSearch({ value, onChange, placeholder, width = 320 }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: width }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}><Icon name="search" size={16} /></span>
      <input value={value} onChange={onChange} placeholder={placeholder} className="erik-input" style={{ width: '100%', height: 40, padding: '0 12px 0 36px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', fontSize: 14, outline: 'none' }} />
    </div>
  );
}

// Маленькая иконочная кнопка для действий в строке.
export function IconBtn({ icon, onClick, title, tone = 'ink-2' }) {
  return (
    <button type="button" className="erik-row-hover" onClick={onClick} title={title} aria-label={title} style={{ width: 32, height: 32, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: `var(--${tone})`, cursor: 'pointer' }}>
      <Icon name={icon} size={16} />
    </button>
  );
}

// Фильтр-чипы.
export function FilterChips({ options, value, onChange }) {
  return (
    <div className="erik-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" className="erik-btn" onClick={() => onChange(o.value)} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`, background: on ? 'var(--ink)' : 'var(--surface)', color: on ? '#fff' : 'var(--ink-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {o.label}{o.count != null && <span style={{ fontFamily: 'var(--fm)', fontSize: 11, opacity: 0.8 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
