import { avatarOf, initialOf } from '../../lib/data';

// Аватар-инициал с детерминированным приглушённым оттенком из имени.
export default function Avatar({ name, size = 36, radius = 999, fontScale = 0.44, style }) {
  const [bg, fg] = avatarOf(name || '');
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: radius,
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--fd)',
        fontWeight: 600,
        fontSize: Math.round(size * fontScale),
        ...style,
      }}
    >
      {initialOf(name)}
    </span>
  );
}
