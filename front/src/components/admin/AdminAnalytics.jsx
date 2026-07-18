import { usePlatformStore } from '../../store/usePlatformStore';
import { THEMES } from '../../lib/data';
import { SectionCard, MiniBars, Ring } from './kit';

// Синтетика роста за 6 недель (новые волонтёры).
const GROWTH = [
  { label: 'Неделя 1', value: 1200 },
  { label: 'Неделя 2', value: 1750 },
  { label: 'Неделя 3', value: 2100 },
  { label: 'Неделя 4', value: 2680 },
  { label: 'Неделя 5', value: 3400 },
  { label: 'Неделя 6', value: 4200 },
];

// Аналитика: города, темы, точность прогноза, надёжность, рост. Демо-данные.
export default function AdminAnalytics() {
  const cities = usePlatformStore((s) => s.cities);
  const events = usePlatformStore((s) => s.events);
  const volunteers = usePlatformStore((s) => s.volunteers);

  // Волонтёры по городам (убыв.).
  const volByCity = [...cities].sort((a, b) => b.vol - a.vol).map((c) => ({ label: c.ru, value: c.vol }));
  // Активные сборы по городам (убыв.).
  const activeByCity = [...cities].sort((a, b) => b.active - a.active).map((c) => ({ label: c.ru, value: c.active }));

  // События по темам: считаем count по theme, оставляем непустые.
  const byTheme = {};
  events.forEach((e) => { byTheme[e.theme] = (byTheme[e.theme] || 0) + 1; });
  const themeBars = Object.keys(byTheme)
    .filter((k) => byTheme[k] > 0 && THEMES[k])
    .map((k) => ({ label: THEMES[k].ru, value: byTheme[k], color: THEMES[k].ink }))
    .sort((a, b) => b.value - a.value);

  // Средняя надёжность волонтёров.
  const avgRel = Math.round(volunteers.reduce((a, v) => a + v.rel, 0) / (volunteers.length || 1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>За всё время · демо-данные</div>

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

        <SectionCard title="Точность прогноза явки">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Ring value={86} label="точность" />
            <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <MetricRow label="Средняя явка" value="74%" />
              <MetricRow label="Отклик на напоминания" value="61%" />
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

        <SectionCard title="Рост за 6 недель">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>новые волонтёры</span>
            <MiniBars data={GROWTH} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// Строка-метрика: подпись слева, значение (моно) справа.
function MetricRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}
