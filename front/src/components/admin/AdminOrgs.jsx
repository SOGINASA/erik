import { useEffect, useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { AdminSearch, FilterChips, Table, Tr, Td, StatusPill, IconBtn, SectionCard } from './kit';
import Button from '../ui/Button';
import { THEMES } from '../../lib/data';

// Русская плюрализация для счётчика организаций.
const plOrg = (n) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'организация';
  if (a >= 2 && a <= 4 && !(b >= 12 && b <= 14)) return 'организации';
  return 'организаций';
};

// Квадратный аватар темы: подложка THEMES[cat].tint, инициал цветом .ink.
function ThemeAvatar({ cat, name, size = 34 }) {
  const t = THEMES[cat] || {};
  return (
    <span style={{ width: size, height: size, flex: 'none', borderRadius: 'var(--r-s)', background: t.tint || 'var(--paper)', color: t.ink || 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontWeight: 700, fontSize: Math.round(size * 0.44) }}>
      {((name || '')[0] || '?').toUpperCase()}
    </span>
  );
}

const HEAD = [
  { label: 'Организация' },
  { label: 'Категория' },
  { label: 'Город' },
  { label: 'Статус' },
  { label: 'События', align: 'right' },
  { label: 'Волонтёры', align: 'right' },
  { label: '', align: 'right' },
];

// Организации (НКО): поиск, фильтр по статусу, модерация и переход к карточке.
export default function AdminOrgs() {
  const orgs = usePlatformStore((s) => s.orgs);
  const loadPlatform = usePlatformStore((s) => s.loadPlatform);
  const approveOrg = usePlatformStore((s) => s.approveOrg);
  const rejectOrg = usePlatformStore((s) => s.rejectOrg);
  const showToast = useUiStore((s) => s.showToast);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all'); // all | verified | pending

  // Тянем НКО с сервера (идемпотентно; мок-фолбэк при офлайне остаётся в сторе).
  useEffect(() => { loadPlatform(); }, [loadPlatform]);

  const verifiedCount = orgs.filter((o) => o.verified).length;
  const pendingCount = orgs.length - verifiedCount;
  const query = q.trim().toLowerCase();

  const filtered = orgs.filter((o) => {
    if (status === 'verified' && !o.verified) return false;
    if (status === 'pending' && o.verified) return false;
    if (query && !`${o.name} ${o.city}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const chips = [
    { value: 'all', label: 'Все', count: orgs.length },
    { value: 'verified', label: 'Проверенные', count: verifiedCount },
    { value: 'pending', label: 'На модерации', count: pendingCount },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* поиск + счётчик */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <AdminSearch value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или городу" />
        </div>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{filtered.length} {plOrg(filtered.length)}</span>
      </div>

      {/* фильтр по статусу */}
      <FilterChips options={chips} value={status} onChange={setStatus} />

      {/* таблица */}
      <SectionCard pad={0}>
        {filtered.length ? (
          <Table head={HEAD}>
            {filtered.map((o) => (
              <Tr key={o.id}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ThemeAvatar cat={o.cat} name={o.name} />
                    <span style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{o.name}</span>
                  </div>
                </Td>
                <Td nowrap style={{ color: 'var(--ink-2)' }}>{(THEMES[o.cat] || {}).ru || o.cat}</Td>
                <Td nowrap style={{ color: 'var(--ink-2)' }}>{o.city}</Td>
                <Td nowrap>
                  {o.verified
                    ? <StatusPill tone="yard" icon="check">Проверена</StatusPill>
                    : <StatusPill tone="maybe">На модерации</StatusPill>}
                </Td>
                <Td align="right" style={{ fontFamily: 'var(--fm)', color: 'var(--ink)' }}>{o.events}</Td>
                <Td align="right" style={{ fontFamily: 'var(--fm)', color: 'var(--ink)' }}>{o.vol}</Td>
                <Td align="right" nowrap>
                  <div style={{ display: 'inline-flex', gap: 8, justifyContent: 'flex-end' }}>
                    {o.verified ? (
                      <>
                        <IconBtn icon="external" title="Открыть" onClick={() => showToast(`Открываю «${o.name}»`)} />
                        <IconBtn icon="edit" title="Изменить" onClick={() => showToast(`Редактирование «${o.name}»`)} />
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="primary" onClick={() => approveOrg(o.id)}>Одобрить</Button>
                        <Button size="sm" variant="secondary" onClick={() => rejectOrg(o.id)}>Отклонить</Button>
                      </>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        ) : (
          <div style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Организации не найдены
          </div>
        )}
      </SectionCard>
    </div>
  );
}
