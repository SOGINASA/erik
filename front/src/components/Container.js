import Icon from './Icon';

// Контейнер страницы: десктоп max-width 1120 (narrow — 560), padding 20→40px.
export function Container({ narrow, children, style }) {
  return (
    <div style={{ width: '100%', maxWidth: narrow ? 560 : 1120, margin: '0 auto', padding: '0 clamp(20px, 4vw, 40px)', ...style }}>
      {children}
    </div>
  );
}

// Кнопка «назад» в шапке экрана.
export function BackButton({ onClick, label = 'Назад' }) {
  return (
    <button
      type="button"
      className="erik-row-hover"
      onClick={onClick}
      aria-label={label}
      style={{ width: 40, height: 40, marginLeft: -8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}
    >
      <Icon name="back" size={20} />
    </button>
  );
}
