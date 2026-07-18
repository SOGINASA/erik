// Временная заглушка для экранов, которые ещё портируются.
export default function Stub({ title }) {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em' }}>{title}</h1>
      <p style={{ color: 'var(--ink-2)' }}>Экран в разработке…</p>
    </div>
  );
}
