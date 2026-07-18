import { useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { Table, Tr, Td, AdminSearch, FilterChips, IconBtn, SectionCard } from './kit';
import { THEMES } from '../../lib/data';

// Раздел «События/сборы»: поиск, фильтр по теме и таблица со сводкой явки.
export default function AdminEvents() {
  const events = usePlatformStore((s) => s.events);
  const orgs = usePlatformStore((s) => s.orgs);
  const cities = usePlatformStore((s) => s.cities);
  const showToast = useUiStore((s) => s.showToast);

  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('all');

  // имена по id (мягко, чтобы не падать на отсутствии)
  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '';
  const cityName = (id) => cities.find((c) => c.id === id)?.ru || '';

  // чипы тем: «Все» + только встречающиеся темы, с count по событиям
  const themeOptions = [
    { value: 'all', label: 'Все', count: events.length },
    ...Object.keys(THEMES)
      .filter((k) => events.some((e) => e.theme === k))
      .map((k) => ({ value: k, label: THEMES[k].ru, count: events.filter((e) => e.theme === k).length })),
  ];

  // фильтр по теме и поиску (событие / город / организатор)
  const s = q.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (theme !== 'all' && e.theme !== theme) return false;
    if (!s) return true;
    return [e.titleRu, cityName(e.cityId), orgName(e.orgId)].some((x) => x.toLowerCase().includes(s));
  });

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
          <div style={{ padding: '48px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Ничего не найдено</div>
        ) : (
          <Table head={head}>
            {filtered.map((e) => {
              const t = THEMES[e.theme];
              const pct = Math.min(100, Math.round((e.going / e.needed) * 100));
              return (
                <Tr key={e.id}>
                  <Td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, color: 'var(--ink)' }}>{e.titleRu}</span>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{e.code}</span>
                    </div>
                  </Td>
                  <Td nowrap style={{ color: 'var(--ink-2)' }}>{orgName(e.orgId)}</Td>
                  <Td nowrap style={{ color: 'var(--ink-2)' }}>{cityName(e.cityId)}</Td>
                  <Td>
                    {t && (
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: t.tint, color: t.ink, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{t.ru}</span>
                    )}
                  </Td>
                  <Td nowrap>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{e.dateRu}</span>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{e.time}</span>
                    </div>
                  </Td>
                  <Td nowrap>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink)' }}>{e.going}/{e.needed}</span>
                      <div style={{ width: 64, height: 4, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: t ? t.ink : 'var(--yard)', borderRadius: 999 }} />
                      </div>
                    </div>
                  </Td>
                  <Td align="right">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <IconBtn icon="external" title="Открыть" onClick={() => showToast(`Открываю: ${e.titleRu}`)} />
                      <IconBtn icon="trash" tone="ink-3" title="Снять с публикации" onClick={() => showToast('Событие снято с публикации')} />
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
