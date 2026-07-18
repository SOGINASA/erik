import Icon from '../Icon';
import { useUiStore } from '../../store/useUiStore';

// Пустое состояние (ТЗ §4.8): приглашение, а не извинение.
export function EmptyState({ icon = 'users', title, sub, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '56px 20px', gap: 8 }}>
      <span style={{ color: 'var(--ink-3)', marginBottom: 4 }}>
        <Icon name={icon} size={40} stroke={1.5} />
      </span>
      <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 21, color: 'var(--ink)' }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: 'var(--ink-2)', maxWidth: 340, lineHeight: 1.45 }}>{sub}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

// Тост (ТЗ §4.7): снизу по центру, 3.5с, тап/свайп закрывает. Один за раз.
export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (!toast) return null;
  return (
    <div
      onClick={dismiss}
      role="status"
      style={{
        position: 'fixed',
        zIndex: 80,
        bottom: 'calc(84px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--ink)',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 'var(--r-m)',
        fontSize: 14,
        fontWeight: 500,
        boxShadow: 'var(--shadow-pop)',
        animation: 'erik-rise var(--t-base) var(--ease-out)',
        maxWidth: 'calc(100vw - 40px)',
        cursor: 'pointer',
      }}
    >
      {toast}
    </div>
  );
}

// Скелетон (ТЗ §4.9): однотонная плашка, пульсация без бегущего блика.
export function Skeleton({ width = '100%', height = 16, radius = 8, style }) {
  return (
    <span
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        background: 'var(--line)',
        animation: 'erik-pulse 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
