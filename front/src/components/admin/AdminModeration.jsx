import { useEffect, useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useLang } from '../../i18n';
import { api } from '../../lib/api';
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

// Статус жалобы → подпись пилла и тон.
const REPORT_STATUS = {
  open: { label: 'Открыта', tone: 'maybe' },
  reviewing: { label: 'На проверке', tone: 'blue' },
  resolved: { label: 'Решено', tone: 'yard' },
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

// Модерация: верификация НКО и разбор жалоб (данные из usePlatformStore).
export default function AdminModeration() {
  const orgs = usePlatformStore((s) => s.orgs);
  const reports = usePlatformStore((s) => s.reports);
  const loadPlatform = usePlatformStore((s) => s.loadPlatform);
  const loadReports = usePlatformStore((s) => s.loadReports);
  const approveOrg = usePlatformStore((s) => s.approveOrg);
  const rejectOrg = usePlatformStore((s) => s.rejectOrg);
  const reviewReport = usePlatformStore((s) => s.reviewReport);
  const resolveReport = usePlatformStore((s) => s.resolveReport);
  const lang = useLang();
  const [stats, setStats] = useState(null);

  // Организации грузим из платформы, жалобы — отдельным вызовом (в App.jsx он не зовётся).
  useEffect(() => { loadPlatform(); loadReports(); }, [loadPlatform, loadReports]);
  // Реальная метрика «ср. время реакции» из /admin/stats.
  useEffect(() => { api.adminStats().then(setStats).catch(() => {}); }, []);

  const pending = orgs.filter((o) => !o.verified);
  const openReports = reports.filter((r) => r.status === 'open').length;
  // ср. время реакции модерации: реальное из бэкенда, иначе «—»
  const reaction = stats && stats.avgReactionHours != null ? `${stats.avgReactionHours} ч` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        <StatCard label="На верификации" value={pending.length} sub="ждут решения" subTone="maybe" icon="shield" accent="var(--maybe)" tint="var(--maybe-soft)" />
        <StatCard label="Жалобы" value={openReports} sub="открытых обращений" subTone="maybe" icon="bell" accent="var(--maybe)" tint="var(--maybe-soft)" />
        <StatCard label="Ср. время реакции" value={reaction} sub="от жалобы до решения" icon="clock" />
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
                  <Button size="sm" variant="secondary" onClick={() => rejectOrg(o.id)}>Отклонить</Button>
                  <Button size="sm" variant="primary" onClick={() => approveOrg(o.id)}>Одобрить</Button>
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
        {reports.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {reports.map((r, i) => {
              const st = REPORT_STATUS[r.status] || REPORT_STATUS.open;
              const resolved = r.status === 'resolved';
              const circle = resolved
                ? { bg: 'var(--yard-soft)', fg: 'var(--yard)' }
                : { bg: 'var(--maybe-soft)', fg: 'var(--maybe)' };
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', borderBottom: i < reports.length - 1 ? '1px solid var(--line)' : 'none', opacity: resolved ? 0.7 : 1 }}>
                  <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, background: circle.bg, color: circle.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Warn />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.35 }}>{lang === 'kz' ? r.kz : r.ru}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.count} {plZh(r.count)}</span>
                    </div>
                  </div>
                  {!resolved && (
                    <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                      {r.status === 'open' && (
                        <Button size="sm" variant="secondary" onClick={() => reviewReport(r.id)}>На проверку</Button>
                      )}
                      <Button size="sm" variant="primary" onClick={() => resolveReport(r.id)}>Решено</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Жалоб нет
          </div>
        )}
      </SectionCard>
    </div>
  );
}
