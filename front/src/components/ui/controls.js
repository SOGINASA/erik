// Поля ввода, степпер, чипы, сегмент-табы.

// Поле (ТЗ §4.3): лейбл-caption сверху, высота 48, border line→ink при фокусе.
export function Field({ label, error, inputStyle, ...rest }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        className="erik-input"
        style={{
          width: '100%', height: 48, padding: '0 14px', borderRadius: 'var(--r-s)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}`, background: 'var(--surface)',
          color: 'var(--ink)', fontSize: 16, outline: 'none', transition: 'border-color var(--t-fast)', ...inputStyle,
        }}
        {...rest}
      />
      {error && <span style={{ display: 'block', marginTop: 6, fontSize: 14, color: 'var(--danger)' }}>{error}</span>}
    </label>
  );
}

export function Textarea({ label, rows = 4, style, ...rest }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <textarea
        className="erik-textarea"
        rows={rows}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 'var(--r-s)', border: '1px solid var(--line)',
          background: 'var(--surface)', color: 'var(--ink)', fontSize: 15, lineHeight: 1.5, outline: 'none',
          resize: 'none', transition: 'border-color var(--t-fast)', ...style,
        }}
        {...rest}
      />
    </label>
  );
}

export function FieldLabel({ children }) {
  return (
    <span style={{ display: 'block', fontSize: 13, letterSpacing: '.01em', color: 'var(--ink-3)', marginBottom: 6 }}>
      {children}
    </span>
  );
}

// Степпер −/+ для числовых полей.
export function Stepper({ value, onDec, onInc }) {
  const btn = { width: 46, height: 46, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, border: '1px solid var(--line)', borderRadius: 'var(--r-s)', overflow: 'hidden' }}>
      <button type="button" className="erik-btn" onClick={onDec} style={btn} aria-label="−">−</button>
      <span style={{ minWidth: 52, textAlign: 'center', fontFamily: 'var(--fm)', fontWeight: 500, fontSize: 16 }}>{value}</span>
      <button type="button" className="erik-btn" onClick={onInc} style={btn} aria-label="+">+</button>
    </div>
  );
}

// Чип-пилюля (статус). По умолчанию — «yard».
export function Chip({ children, bg = 'var(--yard-soft)', color = 'var(--yard)', style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 10px', borderRadius: 999, background: bg, color, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  );
}

// Сегментированный переключатель (стиль полосы, вкладки рейтинга).
export function SegTabs({ options, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className="erik-btn"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, border: 'none', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-3)',
              fontFamily: 'var(--fb)', fontWeight: 500, fontSize: 13, padding: '7px 11px', borderRadius: 8, cursor: 'pointer',
              boxShadow: on ? '0 1px 2px rgba(20,24,26,.09)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
