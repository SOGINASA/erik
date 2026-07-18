import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { StatCard, SectionCard, MiniBars, Ring } from './kit';
import Icon from '../Icon';
import Button from '../ui/Button';

const NOTIF_ICON = { answer: 'check', reminder: 'bell', badge: 'trophy', event: 'calendar', system: 'shield' };
const NOTIF_TINT = { answer: 'var(--yard-soft)', reminder: 'var(--maybe-soft)', badge: '#EDE6E8', event: '#E4EAEE', system: '#EEF0EC' };
const NOTIF_INK = { answer: 'var(--yard)', reminder: '#8a5a17', badge: '#6b4550', event: '#3d5566', system: 'var(--ink-2)' };

// Обзор: ключевые метрики платформы, графики и последняя активность.
export default function AdminOverview() {
  const cities = usePlatformStore((s) => s.cities);
  const orgs = usePlatformStore((s) => s.orgs);
  const events = usePlatformStore((s) => s.events);
  const volunteers = usePlatformStore((s) => s.volunteers);
  const charity = usePlatformStore((s) => s.charity);
  const notifs = usePlatformStore((s) => s.notifs);
  const showToast = useUiStore((s) => s.showToast);

  const volTotal = cities.reduce((a, c) => a + c.vol, 0);
  const activeTotal = cities.reduce((a, c) => a + c.active, 0);
  const avgRel = Math.round(volunteers.reduce((a, v) => a + v.rel, 0) / (volunteers.length || 1));
  const raised = charity.filter((c) => c.kind === 'money').reduce((a, c) => a + c.raised, 0);
  const verified = orgs.filter((o) => o.verified).length;
  const pending = orgs.filter((o) => !o.verified).length + 2;

  const cityBars = [...cities].sort((a, b) => b.vol - a.vol).slice(0, 7).map((c) => ({ label: c.ru, value: c.vol }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        <StatCard label="Волонтёры" value={volTotal.toLocaleString('ru-RU')} sub="+340 за неделю" subTone="yard" icon="users" />
        <StatCard label="Активные сборы" value={activeTotal} sub="сегодня в системе" icon="calendar" />
        <StatCard label="Организации" value={orgs.length} sub={`${verified} проверенных`} icon="shield" />
        <StatCard label="Города" value={cities.length} sub="покрытие Казахстана" icon="map" />
        <StatCard label="Средняя надёжность" value={`${avgRel}%`} sub="по волонтёрам" icon="check" />
        <StatCard label="Собрано на помощь" value={`${raised.toLocaleString('ru-RU')} ₸`} sub="по кампаниям" icon="heart" accent="#9a3b34" tint="#F3E3E1" />
        <StatCard label="На модерации" value={pending} sub="требуют внимания" subTone="maybe" icon="filter" accent="var(--maybe)" tint="var(--maybe-soft)" />
        <StatCard label="Событий в ленте" value={events.length} sub="активных" icon="feed" />
      </div>

      {/* графики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <SectionCard title="Волонтёры по городам">
          <MiniBars data={cityBars} />
        </SectionCard>
        <SectionCard title="Здоровье платформы">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={86} label="точность" />
            <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <HealthRow label="Точность прогноза явки" value="86%" tone="var(--yard)" />
              <HealthRow label="Средняя явка от подтв." value="74%" tone="var(--yard)" />
              <HealthRow label="Активных координаторов" value="128" tone="var(--ink)" />
              <HealthRow label="Отклик на напоминания" value="61%" tone="var(--maybe)" />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* активность + быстрые действия */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <SectionCard title="Последняя активность" pad={8}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {notifs.map((n) => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px' }}>
                <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 999, background: NOTIF_TINT[n.type] || '#EEF0EC', color: NOTIF_INK[n.type] || 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={NOTIF_ICON[n.type] || 'bell'} size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.35 }}>{n.ru}</span>
                <span style={{ flex: 'none', fontSize: 12, color: 'var(--ink-3)' }}>{n.time}</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Быстрые действия">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="secondary" icon="bell" full onClick={() => showToast('Открыт конструктор рассылки')} style={{ justifyContent: 'flex-start' }}>Создать рассылку</Button>
            <Button variant="secondary" icon="filter" full onClick={() => showToast('Переход к модерации')} style={{ justifyContent: 'flex-start' }}>Проверить заявки ({pending})</Button>
            <Button variant="secondary" icon="external" full onClick={() => showToast('Отчёт экспортирован')} style={{ justifyContent: 'flex-start' }}>Экспорт отчёта</Button>
            <Button variant="secondary" icon="users" full onClick={() => showToast('Открыт список пользователей')} style={{ justifyContent: 'flex-start' }}>Управление доступом</Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function HealthRow({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 14, color: tone }}>{value}</span>
    </div>
  );
}
