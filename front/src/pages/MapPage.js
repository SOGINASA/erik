import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { Container } from '../components/Container';
import Icon from '../components/Icon';

// Экран «Карта сборов»: иллюстрация карты Казахстана с пинами городов + список.
export default function MapPage() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const cities = usePlatformStore((s) => s.cities);
  const setFeedFilter = usePlatformStore((s) => s.setFeedFilter);

  const totalActive = cities.reduce((a, c) => a + c.active, 0);
  // Клик по городу: фильтруем ленту по городу и переходим в неё.
  const openCity = (id) => {
    setFeedFilter({ fCity: id });
    navigate('/feed');
  };

  return (
    <Container style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="erik-anim-fade" style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 4px' }}>{t.mapTitle}</h1>
        <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 20px' }}>
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{totalActive}</b> {t.mapActive} · {cities.length} {t.citiesWord}
        </p>

        {/* Иллюстрация карты с пинами городов */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', border: '1px solid var(--line)', borderRadius: 'var(--r-l)', overflow: 'hidden', marginBottom: 24, background: 'var(--surface)' }}>
          <img
            src="/assets/map-kz.png"
            alt={isRu ? 'Карта Казахстана' : 'Қазақстан картасы'}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {cities.map((c) => {
            const d = 14 + Math.min(20, c.active / 2); // размер точки зависит от числа активных сборов
            return (
              <button
                key={c.id}
                className="erik-press"
                onClick={() => openCity(c.id)}
                style={{ position: 'absolute', left: `${c.x}%`, top: `${c.y}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0 }}
              >
                <span style={{ width: d, height: d, borderRadius: 999, background: 'var(--yard)', opacity: 0.85, border: '2px solid var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', background: 'rgba(255,255,255,.75)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>{isRu ? c.ru : c.kz} · {c.active}</span>
              </button>
            );
          })}
        </div>

        {/* Список городов */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {cities.map((c) => (
            <button
              key={c.id}
              className="erik-row-hover"
              onClick={() => openCity(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--yard)', flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>{isRu ? c.ru : c.kz}</span>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-2)' }}>{c.active}</span>
              <Icon name="chevronRight" size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
            </button>
          ))}
        </div>
      </div>
    </Container>
  );
}
