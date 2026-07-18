import { useEffect, useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { useLang } from '../../i18n';
import { api } from '../../lib/api';
import { Table, Tr, Td, AdminSearch, FilterChips, IconBtn, SectionCard } from './kit';
import { THEMES } from '../../lib/data';

// Раздел «События/сборы»: поиск, фильтр по теме и таблица со сводкой явки.
// Список приходит из admin-API (api.adminEvents); снятие с публикации — оптимистично.
export default function AdminEvents() {
  const orgs = usePlatformStore((s) => s.orgs);
  const cities = usePlatformStore((s) => s.cities);
  const showToast = useUiStore((s) => s.showToast);
  const lang = useLang();
  const isKz = lang === 'kz';

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('all');

  // Загрузка событий из admin-API. При ошибке остаёмся на прежнем/пустом списке, не падаем.
  // Фильтр статуса отсутствует в вёрстке, поэтому qs пустой (тема фильтруется на клиенте).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.adminEvents('');
        if (alive && Array.isArray(res.events)) setEvents(res.events);
      } catch (_) {
        /* офлайн/не админ — оставляем прежнее/пустое */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // локализованные хелперы по id (мягко, чтобы не падать на отсутствии)
  // admin-API отдаёт целочисленный orgId → сопоставляем с префиксным id стора ('o'+N).
  const orgName = (id) => orgs.find((o) => o.id === 'o' + id)?.name || '';
  const cityName = (id) => {
    const c = cities.find((x) => x.id === id);
    return c ? (isKz ? c.kz : c.ru) : '';
  };
  const evTitle = (e) => (isKz ? e.titleKz : e.titleRu) || e.titleRu || '';
  const evDate = (e) => (isKz ? e.dateKz : e.dateRu) || e.dateRu || '';

  // чипы тем: «Все» + только встречающиеся темы, с count по событиям
  const themeOptions = [
    { value: 'all', label: isKz ? 'Барлығы' : 'Все', count: events.length },
    ...Object.keys(THEMES)
      .filter((k) => events.some((e) => e.theme === k))
      .map((k) => ({ value: k, label: isKz ? THEMES[k].kz : THEMES[k].ru, count: events.filter((e) => e.theme === k).length })),
  ];

  // фильтр по теме и поиску (событие / город / организатор)
  const s = q.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (theme !== 'all' && e.theme !== theme) return false;
    if (!s) return true;
    return [evTitle(e), cityName(e.cityId), orgName(e.orgId)].some((x) => x.toLowerCase().includes(s));
  });

  // снять с публикации: оптимистично убираем из списка, при ошибке — откат + тост
  const unpublish = (e) => {
    const prev = events;
    setEvents((list) => list.filter((x) => x.id !== e.id));
    api
      .unpublishEvent(e.id)
      .then(() => showToast(isKz ? 'Іс-шара жарияланымнан алынды' : 'Событие снято с публикации'))
      .catch(() => {
        setEvents(prev);
        showToast(isKz ? 'Жарияланымнан алу мүмкін болмады' : 'Не удалось снять с публикации');
      });
  };

  const head = [
    { label: 'Событие' },
    { label: 'Организатор' },
    { label: 'Город' },
    { label: 'Тема' },
    { label: 'Когда' },
    { label: 'Явка' },
    { label: '', align: 'right' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* поиск + счётчик */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <AdminSearch value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по событию, городу, организатору" />
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{filtered.length} событий</span>
      </div>

      {/* фильтр по теме */}
      <FilterChips options={themeOptions} value={theme} onChange={setTheme} />

      {/* таблица */}
      <SectionCard pad={0}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            {loading ? (isKz ? 'Жүктелуде…' : 'Загрузка…') : 'Ничего не найдено'}
          </div>
        ) : (
          <Table head={head}>
            {filtered.map((e) => {
              const t = THEMES[e.theme];
              const going = e.status === 'done' ? (e.came ?? 0) : (e.yes ?? 0);
              const needed = e.needed || 0;
              const pct = needed ? Math.min(100, Math.round((going / needed) * 100)) : 0;
              return (
                <Tr key={e.id}>
                  <Td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, color: 'var(--ink)' }}>{evTitle(e)}</span>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{e.code}</span>
                    </div>
                  </Td>
                  <Td nowrap style={{ color: 'var(--ink-2)' }}>{orgName(e.orgId)}</Td>
                  <Td nowrap style={{ color: 'var(--ink-2)' }}>{cityName(e.cityId)}</Td>
                  <Td>
                    {t && (
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: t.tint, color: t.ink, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{isKz ? t.kz : t.ru}</span>
                    )}
                  </Td>
                  <Td nowrap>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{evDate(e)}</span>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{e.time}</span>
                    </div>
                  </Td>
                  <Td nowrap>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink)' }}>{going}/{needed}</span>
                      <div style={{ width: 64, height: 4, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: t ? t.ink : 'var(--yard)', borderRadius: 999 }} />
                      </div>
                    </div>
                  </Td>
                  <Td align="right">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <IconBtn icon="external" title="Открыть" onClick={() => showToast(`${isKz ? 'Ашылуда' : 'Открываю'}: ${evTitle(e)}`)} />
                      <IconBtn icon="trash" tone="ink-3" title="Снять с публикации" onClick={() => unpublish(e)} />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
