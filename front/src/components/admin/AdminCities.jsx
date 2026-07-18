import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { StatCard, SectionCard, Table, Tr, Td, IconBtn } from './kit';

const HEAD = [
  { label: 'Город' },
  { label: 'Активные сборы', align: 'right' },
  { label: 'Волонтёры', align: 'right' },
  { label: 'Доля волонтёров' },
  { label: '' },
];

// Города: сводные метрики и таблица с долей волонтёров.
export default function AdminCities() {
  const cities = usePlatformStore((s) => s.cities);
  const showToast = useUiStore((s) => s.showToast);

  const activeTotal = cities.reduce((a, c) => a + c.active, 0);
  const volTotal = cities.reduce((a, c) => a + c.vol, 0);
  const maxVol = Math.max(1, ...cities.map((c) => c.vol));
  const sorted = [...cities].sort((a, b) => b.vol - a.vol); // по волонтёрам, убыв.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* сводные метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <StatCard label="Города" value={cities.length} sub="покрытие Казахстана" icon="map" />
        <StatCard label="Активные сборы" value={activeTotal} sub="сейчас в системе" icon="calendar" />
        <StatCard label="Волонтёры" value={volTotal.toLocaleString('ru-RU')} sub="по городам" subTone="yard" icon="users" />
      </div>

      {/* таблица городов */}
      <SectionCard title="Города Казахстана" pad={0}>
        <Table head={HEAD}>
          {sorted.map((c) => {
            const pct = Math.round((c.vol / maxVol) * 100);
            return (
              <Tr key={c.id}>
                <Td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, flex: 'none', borderRadius: 999, background: 'var(--yard)' }} />
                    <span style={{ fontWeight: 600 }}>{c.ru}</span>
                  </span>
                </Td>
                <Td align="right" nowrap style={{ fontFamily: 'var(--fm)' }}>{c.active}</Td>
                <Td align="right" nowrap style={{ fontFamily: 'var(--fm)' }}>{c.vol.toLocaleString('ru-RU')}</Td>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--yard)', borderRadius: 999 }} />
                    </div>
                    <span style={{ flex: 'none', width: 40, textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-2)' }}>{pct}%</span>
                  </div>
                </Td>
                <Td align="right" nowrap>
                  <IconBtn icon="external" title="Открыть" onClick={() => showToast(`Город ${c.ru}`)} />
                </Td>
              </Tr>
            );
          })}
        </Table>
      </SectionCard>
    </div>
  );
}
