import { usePlatformStore } from '../../store/usePlatformStore';
import { useUiStore } from '../../store/useUiStore';
import { StatCard, SectionCard, StatusPill } from './kit';
import Button from '../ui/Button';
import { THEMES } from '../../lib/data';

// Русская плюрализация для количества жалоб.
const plZh = (n) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'жалоба';
  if (a >= 2 && a <= 4 && !(b >= 12 && b <= 14)) return 'жалобы';
  return 'жалоб';
};

// Квадратный аватар темы (как в списке организаций).
function ThemeAvatar({ cat, name, size = 34 }) {
  const t = THEMES[cat] || {};
  return (
    <span style={{ width: size, height: size, flex: 'none', borderRadius: 'var(--r-s)', background: t.tint || 'var(--paper)', color: t.ink || 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontWeight: 700, fontSize: Math.round(size * 0.44) }}>
      {((name || '')[0] || '?').toUpperCase()}
    </span>
  );
}

// Иконка-предупреждение (треугольник) для жалоб.
function Warn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4l9 15.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Демо-жалобы (без бэкенда): текст, объект жалобы, число обращений и тон пилла.
const COMPLAINTS = [
  { txt: 'Событие «Быстрый заработок» похоже на спам', target: 'Событие', count: 3, tone: 'maybe' },
  { txt: 'Профиль с оскорблениями в чате', target: 'Профиль', count: 1, tone: 'danger' },
  { txt: 'НКО публикует нерелевантные сборы', target: 'НКО', count: 2, tone: 'maybe' },
];

// Модерация: верификация НКО и разбор жалоб (все действия — тосты-заглушки).
export default function AdminModeration() {
  const orgs = usePlatformStore((s) => s.orgs);
  const showToast = useUiStore((s) => s.showToast);
  const pending = orgs.filter((o) => !o.verified);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        <StatCard label="На верификации" value={pending.length} sub="ждут решения" subTone="maybe" icon="shield" accent="var(--maybe)" tint="var(--maybe-soft)" />
        <StatCard label="Жалобы" value={COMPLAINTS.length} sub="открытых обращений" subTone="maybe" icon="bell" accent="var(--maybe)" tint="var(--maybe-soft)" />
        <StatCard label="Ср. время реакции" value="2 ч" sub="за последние 7 дней" icon="clock" />
      </div>

      {/* заявки на верификацию */}
      <SectionCard title="Заявки на верификацию" pad={8}>
        {pending.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pending.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', borderBottom: i < pending.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <ThemeAvatar cat={o.cat} name={o.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{(THEMES[o.cat] || {}).ru || o.cat} · {o.city}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                  <Button size="sm" variant="secondary" onClick={() => showToast('Отклонено')}>Отклонить</Button>
                  <Button size="sm" variant="primary" onClick={() => showToast(`${o.name} одобрена`)}>Одобрить</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Все организации проверены
          </div>
        )}
      </SectionCard>

      {/* жалобы */}
      <SectionCard title="Жалобы" pad={8}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {COMPLAINTS.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', borderBottom: i < COMPLAINTS.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, background: 'var(--maybe-soft)', color: 'var(--maybe)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Warn />
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.35 }}>{c.txt}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill tone={c.tone}>{c.target}</StatusPill>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.count} {plZh(c.count)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                <Button size="sm" variant="secondary" onClick={() => showToast('Отправлено на проверку')}>Отклонить</Button>
                <Button size="sm" variant="danger" onClick={() => showToast('Заблокировано')}>Заблокировать</Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
