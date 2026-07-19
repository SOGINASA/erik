import { useEffect, useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { THEMES } from '../../lib/data';
import { api } from '../../lib/api';
import { SectionCard, MiniBars, Ring } from './kit';

// Пустой каркас — НИКАКИХ выдуманных чисел: до загрузки/при ошибке показываем пусто, а не мок.
const EMPTY = { attendanceRate: null, byCity: [], byTheme: [], growth: [] };

const MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
// 'YYYY-MM' → 'Июл 2026' (для подписей роста).
function monthLabel(ym) {
  if (typeof ym !== 'string') return ym;
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return MONTHS_RU[idx] != null ? `${MONTHS_RU[idx]} ${y}` : ym;
}

// Аналитика: города, темы, явка, надёжность, рост. Данные из api.adminAnalytics(),
// при ошибке остаёмся на демо-данных.
export default function AdminAnalytics() {
  const volunteers = usePlatformStore((s) => s.volunteers);

  const [analytics, setAnalytics] = useState(EMPTY);
  const [stats, setStats] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.adminAnalytics();
        if (alive) { setAnalytics((prev) => ({ ...prev, ...data })); setLoaded(true); }
      } catch {
        if (alive) setLoaded(true);   // ошибка — пусто, без выдуманных чисел
      }
    })();
    api.adminStats().then((s) => { if (alive) setStats(s); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Волонтёры по городам (убыв.).
  const volByCity = [...(analytics.byCity || [])].sort((a, b) => b.vol - a.vol).map((c) => ({ label: c.ru, value: c.vol }));
  // Активные сборы по городам (убыв.).
  const activeByCity = [...(analytics.byCity || [])].sort((a, b) => b.active - a.active).map((c) => ({ label: c.ru, value: c.active }));

  // События по темам: подписи и цвет из THEMES, оставляем непустые.
  const themeBars = [...(analytics.byTheme || [])]
    .filter((t) => t.events > 0 && THEMES[t.theme])
    .map((t) => ({ label: THEMES[t.theme].ru, value: t.events, color: THEMES[t.theme].ink }))
    .sort((a, b) => b.value - a.value);

  // Динамика новых пользователей по месяцам.
  const growthBars = (analytics.growth || []).map((g) => ({ label: monthLabel(g.label), value: g.value }));

  // Средняя надёжность — авторитетно из /admin/stats (не из мок-стора).
  const avgRel = stats && stats.avgReliability != null ? stats.avgReliability : 0;
  const attendance = analytics.attendanceRate != null ? analytics.attendanceRate : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>За всё время{loaded ? '' : ' · загрузка…'}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <SectionCard title="Волонтёры по городам">
          <MiniBars data={volByCity} />
        </SectionCard>

        <SectionCard title="Активные сборы по городам">
          <MiniBars data={activeByCity} />
        </SectionCard>

        <SectionCard title="События по темам">
          <MiniBars data={themeBars} />
        </SectionCard>

        <SectionCard title="Средняя явка">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={attendance} label="явка" />
            <div style={{ flex: 1, minWidth: 150, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              Доля подтверждённых участников, которые действительно пришли на события.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Надёжность волонтёров">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={avgRel} label="надёжность" />
            <div style={{ flex: 1, minWidth: 150, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              Средняя надёжность по {volunteers.length} волонтёрам — доля подтверждённых явок, на которые человек действительно пришёл.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Рост новых пользователей">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>новые пользователи по месяцам</span>
            <MiniBars data={growthBars} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
