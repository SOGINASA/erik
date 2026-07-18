import { useSessionStore } from '../../store/useSessionStore';

// Логотип-слово «erik» с зелёной точкой.
export function Logo({ size = 24, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'baseline', gap: 3, border: 'none', background: 'transparent', cursor: onClick ? 'pointer' : 'default', padding: 0 }}
    >
      <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: size, letterSpacing: '-.04em', color: 'var(--ink)' }}>erik</span>
      <span style={{ width: Math.max(5, size * 0.22), height: Math.max(5, size * 0.22), borderRadius: 999, background: 'var(--yard)', display: 'inline-block' }} />
    </button>
  );
}

// Переключатель языка RU / KZ.
export function LangToggle({ surface = 'var(--surface)' }) {
  const lang = useSessionStore((s) => s.lang);
  const setLang = useSessionStore((s) => s.setLang);
  const btn = (code) => ({
    height: 26, minWidth: 34, padding: '0 10px', border: 'none', borderRadius: 999, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: 'var(--fb)',
    background: lang === code ? 'var(--ink)' : 'transparent',
    color: lang === code ? '#fff' : 'var(--ink-3)',
  });
  return (
    <div style={{ display: 'inline-flex', width: 'fit-content', gap: 2, padding: 3, background: surface, border: '1px solid var(--line)', borderRadius: 999 }}>
      <button type="button" style={btn('ru')} onClick={() => setLang('ru')}>RU</button>
      <button type="button" style={btn('kz')} onClick={() => setLang('kz')}>KZ</button>
    </div>
  );
}
