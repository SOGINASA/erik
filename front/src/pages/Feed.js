import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useGatheringStore } from '../store/useGatheringStore';
import { THEMES } from '../lib/data';
import { Container } from '../components/Container';
import EventCard from '../components/EventCard';
import { EmptyState } from '../components/ui/feedback';

// Лента: инициативы и сборы рядом. Фильтр по теме, сетка карточек.
export default function Feed() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const events = usePlatformStore((s) => s.events);
  const fTheme = usePlatformStore((s) => s.fTheme);
  const fCity = usePlatformStore((s) => s.fCity);
  const setFeedFilter = usePlatformStore((s) => s.setFeedFilter);
  const regs = useGatheringStore((s) => s.regs);

  const list = events.filter((e) => (fTheme === 'all' || e.theme === fTheme) && (fCity === 'all' || e.cityId === fCity));

  const chip = (active, tint, ink) => ({
    display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 999,
    border: `1px solid ${active ? (ink || 'var(--ink)') : 'var(--line)'}`, background: active ? (tint || 'var(--ink)') : 'var(--surface)',
    color: active ? (ink || '#fff') : 'var(--ink-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'all var(--t-fast)',
  });

  return (
    <Container style={{ paddingTop: 20, paddingBottom: 40 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 4px' }}>{t.feedTitle}</h1>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 18px' }}>{t.feedSub}</p>

      <div className="erik-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 20 }}>
        <button className="erik-btn" style={chip(fTheme === 'all')} onClick={() => setFeedFilter({ fTheme: 'all' })}>{isRu ? 'Все темы' : 'Барлық тақырып'}</button>
        {Object.keys(THEMES).map((k) => (
          <button key={k} className="erik-btn" style={chip(fTheme === k, THEMES[k].tint, THEMES[k].ink)} onClick={() => setFeedFilter({ fTheme: k })}>{isRu ? THEMES[k].ru : THEMES[k].kz}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon="search" title={isRu ? 'Ничего не нашлось' : 'Ештеңе табылмады'} sub={isRu ? 'Попробуйте другую тему или город.' : 'Басқа тақырып не қаланы таңдаңыз.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {list.map((e) => (
            <EventCard key={e.id} event={e} reg={regs[e.id]} onOpen={() => navigate(`/e/${e.id}`)} />
          ))}
        </div>
      )}
    </Container>
  );
}
