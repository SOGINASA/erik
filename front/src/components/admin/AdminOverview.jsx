import { useEffect, useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { api } from '../../lib/api';
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

  // Реальные метрики платформы. При ошибке остаёмся на вычислениях из стора.
  const [stats, setStats] = useState(null);
  const [attendanceRate, setAttendanceRate] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.adminStats();
        if (alive) setStats(s);
      } catch {
        /* API недоступен — используем вычисления из стора (ниже) */
      }
      try {
        const a = await api.adminAnalytics();
        if (alive && a) setAttendanceRate(a.attendanceRate);
      } catch {
        /* нет данных по явке — покажем '—' */
      }
    })();
    return () => { alive = false; };
  }, []);

  // Фолбэк-вычисления из стора (используются, пока/если api.adminStats() не отдал данные).
  const volTotal = cities.reduce((a, c) => a + c.vol, 0);
  const activeTotal = cities.reduce((a, c) => a + c.active, 0);
  const avgRel = Math.round(volunteers.reduce((a, v) => a + v.rel, 0) / (volunteers.length || 1));
  const raisedStore = charity.filter((c) => c.kind === 'money').reduce((a, c) => a + c.raised, 0);
  const verifiedStore = orgs.filter((o) => o.verified).length;
  const pendingStore = orgs.filter((o) => !o.verified).length;

  // Итоговые значения: приоритет — реальному API, иначе стор.
  const volunteersN = stats?.volunteers ?? volTotal;
  const activeEventsN = stats?.activeEvents ?? activeTotal;
  const orgsN = stats?.orgs ?? orgs.length;
  const verifiedN = stats?.verifiedOrgs ?? verifiedStore;
  const avgReliabilityN = stats?.avgReliability ?? avgRel;
  const raisedN = stats?.raised ?? raisedStore;
  const pendingN = stats?.pendingOrgs ?? pendingStore;
  const openReportsN = stats?.openReports ?? 0;
  const coordinatorsN = stats?.coordinators;

  const cityBars = [...cities].sort((a, b) => b.vol - a.vol).slice(0, 7).map((c) => ({ label: c.ru, value: c.vol }));

  const ringValue = attendanceRate != null ? attendanceRate : avgReliabilityN;
  const ringLabel = attendanceRate != null ? 'явка' : 'надёжность';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        <StatCard label="Волонтёры" value={volunteersN.toLocaleString('ru-RU')} sub="на платформе" icon="users" />
        <StatCard label="Активные сборы" value={activeEventsN} sub="сегодня в системе" icon="calendar" />
        <StatCard label="Организации" value={orgsN} sub={`${verifiedN} проверенных`} icon="shield" />
        <StatCard label="Города" value={cities.length} sub="покрытие Казахстана" icon="map" />
        <StatCard label="Средняя надёжность" value={`${avgReliabilityN}%`} sub="по волонтёрам" icon="check" />
        <StatCard label="Собрано на помощь" value={`${raisedN.toLocaleString('ru-RU')} ₸`} sub="по кампаниям" icon="heart" accent="#9a3b34" tint="#F3E3E1" />
        <StatCard label="На модерации" value={pendingN} sub={stats ? `${openReportsN} жалоб на рассмотрении` : 'требуют внимания'} subTone="maybe" icon="filter" accent="var(--maybe)" tint="var(--maybe-soft)" />
        <StatCard label="Событий в ленте" value={events.length} sub="активных" icon="feed" />
      </div>

      {/* графики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <SectionCard title="Волонтёры по городам">
          <MiniBars data={cityBars} />
        </SectionCard>
        <SectionCard title="Здоровье платформы">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={ringValue} label={ringLabel} />
            <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <HealthRow label="Средняя явка от подтв." value={attendanceRate != null ? `${attendanceRate}%` : '—'} tone="var(--yard)" />
              <HealthRow label="Средняя надёжность" value={`${avgReliabilityN}%`} tone="var(--yard)" />
              <HealthRow label="Активных координаторов" value={coordinatorsN != null ? coordinatorsN.toLocaleString('ru-RU') : '—'} tone="var(--ink)" />
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
            <Button variant="secondary" icon="filter" full onClick={() => showToast('Переход к модерации')} style={{ justifyContent: 'flex-start' }}>Проверить заявки ({pendingN})</Button>
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
