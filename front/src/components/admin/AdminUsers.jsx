import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../../store/useUiStore';
import { api } from '../../lib/api';
import { AdminSearch, FilterChips, Table, Tr, Td, StatusPill, IconBtn, SectionCard } from './kit';
import Avatar from '../ui/Avatar';

// Роли пользователей и их визуальные токены.
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

// Отображаемое имя: полное имя → ник → email.
const nameOf = (u) => u.full_name || u.nickname || u.email || '—';
// Ключ роли для фильтра/подсчёта: админ — отдельно, иначе поле role.
const roleKey = (u) => (u.user_type === 'admin' ? 'admin' : u.role);

const HEAD = [
  { label: 'Пользователь' },
  { label: 'Город' },
  { label: 'Роль' },
  { label: 'Часы', align: 'right' },
  { label: 'События', align: 'right' },
  { label: 'Надёжность', align: 'right' },
  { label: '' },
];

// Управление пользователями: серверный поиск, фильтр по роли, таблица с действиями.
export default function AdminUsers() {
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Загрузка с сервера. Поиск/пагинация — на бэкенде; ввод дебаунсим ~300мс.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.adminUsers(page, query.trim());
        if (cancelled) return;
        setUsers(Array.isArray(res?.users) ? res.users : []);
        setTotal(res?.total ?? 0);
        setPages(res?.pages ?? 1);
      } catch (_) {
        // при ошибке остаёмся на прежнем списке — не падаем
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, page]);

  // Ввод поиска → сбрасываем на первую страницу (api.adminUsers(1, query)).
  const onSearch = (e) => {
    setQuery(e.target.value);
    setPage(1);
  };

  // Счётчики чипов — по реальным данным загруженной страницы.
  const counts = { vol: 0, coord: 0, org: 0 };
  users.forEach((u) => {
    const k = roleKey(u);
    if (counts[k] != null) counts[k] += 1;
  });

  const chips = [
    { value: 'all', label: 'Все', count: users.length },
    { value: 'vol', label: 'Волонтёры', count: counts.vol },
    { value: 'coord', label: 'Координаторы', count: counts.coord },
    { value: 'org', label: 'НКО', count: counts.org },
  ];

  // Фильтр по роли — мгновенный, поверх серверных данных.
  const filtered = role === 'all' ? users : users.filter((u) => roleKey(u) === role);
  // Счётчик: всего с сервера (по текущему поиску), либо число видимых при фильтре роли.
  const shown = role === 'all' ? total : filtered.length;

  // Блокировка/разблокировка — оптимистично, с откатом при ошибке.
  const setActive = async (u, active) => {
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, is_active: active } : x)));
    try {
      await api.updateUser(u.id, { is_active: active });
      showToast(active ? 'Пользователь разблокирован' : 'Пользователь заблокирован');
    } catch (_) {
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, is_active: !active } : x)));
      showToast('Не удалось изменить статус');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* поиск, фильтр по роли, счётчик */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <AdminSearch value={query} onChange={onSearch} placeholder="Поиск по имени или email" />
        <div style={{ flex: 1, minWidth: 160 }}>
          <FilterChips options={chips} value={role} onChange={setRole} />
        </div>
        <span style={{ flex: 'none', fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {shown} {plural(shown, ['пользователь', 'пользователя', 'пользователей'])}
        </span>
      </div>

      {/* таблица пользователей */}
      <SectionCard pad={0}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            {loading ? 'Загрузка…' : 'Никого не нашли'}
          </div>
        ) : (
          <Table head={HEAD}>
            {filtered.map((u) => {
              const blocked = u.is_active === false;
              return (
                <Tr key={u.id} style={blocked ? { opacity: 0.5 } : undefined}>
                  <Td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={nameOf(u)} size={32} />
                      <span style={{ fontWeight: 600 }}>{nameOf(u)}</span>
                      {blocked && <StatusPill tone="out">Заблокирован</StatusPill>}
                    </span>
                  </Td>
                  <Td style={{ color: 'var(--ink-2)' }}>{u.city_id || '—'}</Td>
                  <Td>
                    {u.user_type === 'admin' ? (
                      <StatusPill tone="danger">Админ</StatusPill>
                    ) : ROLE[u.role] ? (
                      <StatusPill tone={ROLE[u.role].tone}>{ROLE[u.role].label}</StatusPill>
                    ) : (
                      <StatusPill tone="out">—</StatusPill>
                    )}
                  </Td>
                  <Td align="right" nowrap style={{ fontFamily: 'var(--fm)' }}>{u.hours_total ?? 0}</Td>
                  <Td align="right" nowrap style={{ fontFamily: 'var(--fm)' }}>{u.events_attended ?? 0}</Td>
                  <Td align="right" nowrap style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: relColor(u.reliability ?? 0) }}>{u.reliability ?? 0}%</Td>
                  <Td align="right" nowrap>
                    <span style={{ display: 'inline-flex', gap: 8, justifyContent: 'flex-end' }}>
                      <IconBtn icon="external" title="Профиль" onClick={() => navigate(`/u/${u.id}`)} />
                      {blocked ? (
                        <IconBtn icon="check" title="Разблокировать" onClick={() => setActive(u, true)} />
                      ) : (
                        <IconBtn icon="close" tone="ink-3" title="Заблокировать" onClick={() => setActive(u, false)} />
                      )}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </SectionCard>

      {/* пагинация (серверная) */}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <button
            type="button"
            className="erik-btn"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ height: 36, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: page <= 1 ? 'var(--ink-3)' : 'var(--ink)', cursor: page <= 1 ? 'default' : 'pointer', fontSize: 14 }}
          >
            ← Назад
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--fm)' }}>{page} / {pages}</span>
          <button
            type="button"
            className="erik-btn"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            style={{ height: 36, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: page >= pages ? 'var(--ink-3)' : 'var(--ink)', cursor: page >= pages ? 'default' : 'pointer', fontSize: 14 }}
          >
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}
