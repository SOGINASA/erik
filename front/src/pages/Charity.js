import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useUiStore } from '../store/useUiStore';
import { Container } from '../components/Container';
import Button from '../components/ui/Button';

// «Нужна помощь»: карточки сборов с прогресс-баром и кнопкой доната.
export default function Charity() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const charity = usePlatformStore((s) => s.charity);
  const orgs = usePlatformStore((s) => s.orgs);
  const cities = usePlatformStore((s) => s.cities);
  const setDonateId = usePlatformStore((s) => s.setDonateId);
  const openSheet = useUiStore((s) => s.openSheet);

  const cityName = (id) => {
    const c = cities.find((x) => x.id === id);
    return c ? (isRu ? c.ru : c.kz) : '';
  };

  return (
    <Container style={{ paddingTop: 24, paddingBottom: 48 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 18px' }}>{t.charityTitle}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {charity.map((c) => {
          const pct = Math.min(100, Math.round((c.raised / c.goal) * 100));
          const org = orgs.find((o) => o.id === c.org) || {};
          const raisedText = c.kind === 'money' ? `${c.raised.toLocaleString('ru-RU')} ₸` : `${c.raised} ${c.unit}`;
          const goalText = c.kind === 'money' ? `${c.goal.toLocaleString('ru-RU')} ₸` : `${c.goal} ${c.unit}`;
          return (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
              <div>
                <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', marginBottom: 2 }}>{isRu ? c.titleRu : c.titleKz}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{org.name} · {cityName(c.cityId)}</div>
              </div>

              <div style={{ height: 8, borderRadius: 999, background: 'var(--line)' }}>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--yard)', width: `${pct}%`, transition: 'width var(--t-move) var(--ease-soft)' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{raisedText}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.charityGoal} {goalText}</span>
              </div>

              <Button full onClick={() => { setDonateId(c.id); openSheet('donate'); }}>{t.help}</Button>
            </div>
          );
        })}
      </div>
    </Container>
  );
}
