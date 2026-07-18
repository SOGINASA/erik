import { useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { AdminSearch, FilterChips, Table, Tr, Td, StatusPill, IconBtn, SectionCard } from './kit';
import Avatar from '../ui/Avatar';

// Роль по индексу: часть — волонтёры, пара — координаторы, одна — НКО.
const roleOf = (i) => (i % 4 === 0 ? 'coord' : i % 7 === 0 ? 'org' : 'vol');
const ROLE = {
  vol: { tone: 'yard', label: 'Волонтёр' },
  coord: { tone: 'blue', label: 'Координатор' },
  org: { tone: 'maybe', label: 'НКО' },
};

// Цвет надёжности: высокая — зелёный, низкая — янтарный, средняя — обычный.
const relColor = (r) => (r >= 90 ? 'var(--yard)' : r < 80 ? 'var(--maybe)' : 'var(--ink)');

// Русская форма множественного числа.
const plural = (n, forms) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return forms[0];
  if (d >= 2 && d <= 4 && (h < 10 || h >= 20)) return forms[1];
  return forms[2];
};

const HEAD = [
  { label: 'Пользователь' },
  { label: 'Город' },
  { label: 'Роль' },
  { label: 'Часы', align: 'right' },
  { label: 'События', align: 'right' },
  { label: 'Надёжность', align: 'right' },
  { label: '' },
];

// Управление пользователями: поиск, фильтр по роли, таблица с действиями.
export default function AdminUsers() {
  const volunteers = usePlatformStore((s) => s.volunteers);
  const me = usePlatformStore((s) => s.me);
  const showToast = useUiStore((s) => s.showToast);

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');

  // Волонтёры + текущий пользователь (координатор) в одном списке, роль — по индексу.
  const users = [...volunteers, { id: me.id, name: me.name, city: me.city, hours: me.hours, events: me.events, rel: me.reliability }]
    .map((u, i) => ({ ...u, role: roleOf(i) }));

  const counts = { vol: 0, coord: 0, org: 0 };
  users.forEach((u) => { counts[u.role] += 1; });

  const chips = [
    { value: 'all', label: 'Все', count: users.length },
    { value: 'vol', label: 'Волонтёры', count: counts.vol },
    { value: 'coord', label: 'Координаторы', count: counts.coord },
    { value: 'org', label: 'НКО', count: counts.org },
  ];

  const q = query.trim().toLowerCase();
  const filtered = users.filter((u) => {
    const okRole = role === 'all' || u.role === role;
    const okQuery = !q || u.name.toLowerCase().includes(q) || u.city.toLowerCase().includes(q);
    return okRole && okQuery;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* поиск, фильтр по роли, счётчик */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <AdminSearch value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени или городу" />
        <div style={{ flex: 1, minWidth: 160 }}>
          <FilterChips options={chips} value={role} onChange={setRole} />
        </div>
        <span style={{ flex: 'none', fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {filtered.length} {plural(filtered.length, ['пользователь', 'пользователя', 'пользователей'])}
        </span>
      </div>

      {/* таблица пользователей */}
      <SectionCard pad={0}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Никого не нашли
          </div>
        ) : (
          <Table head={HEAD}>
            {filtered.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={u.name} size={32} />
                    <span style={{ fontWeight: 600 }}>{u.name}</span>
                  </span>
                </Td>
                <Td style={{ color: 'var(--ink-2)' }}>{u.city}</Td>
                <Td><StatusPill tone={ROLE[u.role].tone}>{ROLE[u.role].label}</StatusPill></Td>
                <Td align="right" nowrap style={{ fontFamily: 'var(--fm)' }}>{u.hours}</Td>
                <Td align="right" nowrap style={{ fontFamily: 'var(--fm)' }}>{u.events}</Td>
                <Td align="right" nowrap style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: relColor(u.rel) }}>{u.rel}%</Td>
                <Td align="right" nowrap>
                  <span style={{ display: 'inline-flex', gap: 8, justifyContent: 'flex-end' }}>
                    <IconBtn icon="external" title="Профиль" onClick={() => showToast('Профиль открыт')} />
                    <IconBtn icon="close" tone="ink-3" title="Заблокировать" onClick={() => showToast('Пользователь заблокирован')} />
                  </span>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
