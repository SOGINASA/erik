import Avatar from './ui/Avatar';

// Строка человека в списке (ТЗ §4.4): аватар-инициал, имя, история, статус-чип справа.
export default function PersonRow({ name, historyText, right, onClick, dim = false, size = 36, style }) {
  return (
    <button
      type="button"
      className="erik-row-hover"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 8px',
        border: 'none', borderRadius: 'var(--r-s)', background: 'transparent', cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', opacity: dim ? 0.72 : 1, ...style,
      }}
    >
      <Avatar name={name} size={size} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        {historyText && <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>{historyText}</span>}
      </span>
      {right}
    </button>
  );
}
