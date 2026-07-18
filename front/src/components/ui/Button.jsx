import Icon from '../Icon';

const H = { lg: 52, md: 44, sm: 36 };
const FS = { lg: 16, md: 15, sm: 14 };

// Кнопка (ТЗ §4.1): primary/secondary/ghost/danger · lg/md/sm.
// Loading: спиннер слева, текст на месте. Focus/hover/active — через .erik-btn.
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  full = false,
  children,
  style,
  className = '',
  ...rest
}) {
  const bg = { primary: 'var(--yard)', danger: 'var(--danger)', secondary: 'var(--surface)', ghost: 'transparent' }[variant];
  const color = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? 'var(--ink-2)' : 'var(--ink)';
  const border = variant === 'secondary' ? '1px solid var(--line)' : '1px solid transparent';
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <button
      className={`erik-btn erik-btn-${variant} ${className}`}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: H[size],
        padding: `0 ${size === 'sm' ? 14 : 20}px`,
        width: full ? '100%' : undefined,
        borderRadius: 'var(--r-m)',
        background: bg,
        color,
        border,
        fontFamily: 'var(--fb)',
        fontWeight: 500,
        fontSize: FS[size],
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} size={iconSize} />}
      {children}
      {!loading && iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'erik-spin 0.7s linear infinite', flex: 'none' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
