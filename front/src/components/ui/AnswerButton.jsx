import Icon from '../Icon';

const KIND = {
  yes: ['var(--yard-soft)', 'var(--yard)'],
  maybe: ['var(--maybe-soft)', 'var(--maybe)'],
  no: ['#EEF0EC', 'var(--out)'],
};

// Кнопка ответа участника (ТЗ §4.2). Не радиокнопка — самостоятельная поверхность.
// Выбранная: заливка своим цветом + бордер в полный цвет + галочка справа.
export default function AnswerButton({ kind, selected, label, onClick, height = 56 }) {
  const [soft, full] = KIND[kind];
  return (
    <button
      type="button"
      className="erik-btn"
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height,
        borderRadius: 'var(--r-m)',
        cursor: 'pointer',
        fontWeight: 500,
        fontSize: 15,
        transition: 'background var(--t-base) var(--ease-soft), border-color var(--t-base) var(--ease-soft)',
        background: selected ? soft : 'var(--surface)',
        border: `1.5px solid ${selected ? full : 'var(--line)'}`,
        color: 'var(--ink)',
      }}
    >
      {label}
      {selected && (
        <span style={{ position: 'absolute', right: 16, color: full, display: 'flex' }}>
          <Icon name="check" size={20} stroke={2.4} />
        </span>
      )}
    </button>
  );
}
