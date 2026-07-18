import { useEffect } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { StatCard, Ring, StatusPill } from './kit';
import Button from '../ui/Button';

// Раздел «Благотворительность»: сводка по сборам + карточки кампаний.
export default function AdminCharity() {
  const charity = usePlatformStore((s) => s.charity);
  const orgs = usePlatformStore((s) => s.orgs);
  const cities = usePlatformStore((s) => s.cities);
  const loadPlatform = usePlatformStore((s) => s.loadPlatform);
  const closeCharity = usePlatformStore((s) => s.closeCharity);
  const showToast = useUiStore((s) => s.showToast);

  // Данные платформы (в т.ч. кампании) из API; идемпотентно, мок-фолбэк в сторе.
  useEffect(() => { loadPlatform(); }, [loadPlatform]);

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '';
  const cityName = (id) => cities.find((c) => c.id === id)?.ru || '';

  // сводные метрики
  const raisedMoney = charity.filter((c) => c.kind === 'money').reduce((a, c) => a + c.raised, 0);
  const avgProgress = Math.round(
    charity.reduce((a, c) => a + Math.round((c.raised / c.goal) * 100), 0) / (charity.length || 1),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* сводка */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        <StatCard label="Кампаний" value={charity.length} sub="всего сборов" icon="heart" />
        <StatCard label="Собрано деньгами" value={`${raisedMoney.toLocaleString('ru-RU')} ₸`} sub="по денежным сборам" icon="heart" accent="#9a3b34" tint="#F3E3E1" />
        <StatCard label="Средний прогресс" value={`${avgProgress}%`} sub="по всем кампаниям" icon="check" />
      </div>

      {/* карточки кампаний */}
      {charity.length === 0 ? (
        <div style={{ padding: '48px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Пока нет кампаний</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {charity.map((c) => {
            const money = c.kind === 'money';
            const pct = Math.min(100, Math.round((c.raised / c.goal) * 100));
            const unit = money ? '₸' : c.unit; // для денег — тенге, иначе своя единица
            const closed = c.closed || c.raised >= c.goal; // кампания закрыта/цель достигнута
            const ring = closed ? 'var(--ink-3)' : money ? 'var(--yard)' : '#3d5566';
            return (
              <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* заголовок */}
                <div>
                  <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 15, color: 'var(--ink)', lineHeight: 1.3 }}>{c.titleRu}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{orgName(c.org)} · {cityName(c.cityId)}</div>
                </div>

                {/* прогресс */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Ring value={pct} size={72} stroke={8} color={ring} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', letterSpacing: '-.02em' }}>{c.raised.toLocaleString('ru-RU')}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>из {c.goal.toLocaleString('ru-RU')} {unit}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <StatusPill tone={money ? 'yard' : 'blue'}>{money ? 'Деньги' : 'Вещи'}</StatusPill>
                      {closed && <StatusPill tone="out" icon="check">Закрыта</StatusPill>}
                    </div>
                  </div>
                </div>

                {/* действия */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" style={{ flex: 1 }} onClick={() => showToast(`Открываю: ${c.titleRu}`)}>Подробнее</Button>
                  {closed ? (
                    <Button size="sm" variant="secondary" style={{ flex: 1 }} disabled>Закрыта</Button>
                  ) : (
                    <Button size="sm" variant="primary" style={{ flex: 1 }} onClick={() => closeCharity(c.id)}>Закрыть сбор</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
