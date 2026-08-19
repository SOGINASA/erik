import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { fromServer, sourceLabel } from '../lib/forecastView';
import { THEMES } from '../lib/data';

// Карточка события для ленты и страницы НКО.
export default function EventCard({ event, reg, onOpen }) {
  const t = useT();
  const isRu = useLang() === 'ru';
  // НКО/город — из стора (реальные данные), а не из статичных демо-констант.
  const orgs = usePlatformStore((s) => s.orgs);
  const cities = usePlatformStore((s) => s.cities);
  const T = THEMES[event.theme] || { ru: '', kz: '', tint: '#eee', ink: '#333' };
  const org = orgs.find((o) => o.id === event.orgId);
  const city = cities.find((c) => c.id === event.cityId);
  // Полоса — про НАБОР (сколько записалось из нужного), а не про явку: going это счётчик
  // нажавших «приду». Прогноза лента не отдаёт, придумывать его на клиенте нельзя.
  const rawPct = Math.round((event.going / event.needed) * 100);
  const pct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : 0;
  const signedText = isRu ? `записались ${event.going} из ${event.needed}` : `${event.needed} ішінен ${event.going} жазылды`;
  // Ветка на будущее: если в карточке появится поле forecast — вместо счётчика показываем
  // прогноз с подписью источника. Пока поля нет, поведение прежнее.
  const evForecast = event.forecast && event.forecast.expected != null ? fromServer(event.forecast) : null;
  const forecastSrc = evForecast ? sourceLabel(evForecast, t) : null;
  const bottomText = evForecast
    ? (isRu ? `${t.fcWillCome} ≈ ${Math.round(evForecast.expected)} ${t.fcOf} ${event.needed}` : `${event.needed} ${t.fcOf} ≈ ${Math.round(evForecast.expected)} ${t.fcWillCome}`)
    : signedText;
  const regLabel = reg ? (reg === 'yes' ? t.ansYes : reg === 'maybe' ? t.ansMaybe : t.ansNo) : null;

  return (
    <button
      type="button"
      className="erik-lift"
      onClick={onOpen}
      style={{ textAlign: 'left', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', cursor: 'pointer', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ position: 'relative', height: 104, background: T.tint, display: 'flex', alignItems: 'flex-end', padding: '12px 14px', overflow: 'hidden' }}>
        {event.image && (
          <img
            src={event.image}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <span style={{ position: 'relative', height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: T.ink, color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '.02em' }}>{isRu ? T.ru : T.kz}</span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 16, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.25 }}>{isRu ? event.titleRu : event.titleKz}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 2 }}>{org?.name} · {isRu ? city?.ru : city?.kz}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>{(isRu ? event.dateRu : event.dateKz)} · {event.time}</div>
        <div role="img" aria-label={signedText} style={{ height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: T.ink, transition: 'width var(--t-move) var(--ease-soft)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-3)' }}>
          <span style={{ minWidth: 0 }}>
            {bottomText}
            {forecastSrc && <span style={{ color: 'var(--ink-3)' }}> · {forecastSrc}</span>}
          </span>
          {regLabel && <span style={{ color: 'var(--yard)', fontWeight: 600, flexShrink: 0 }}>{regLabel}</span>}
        </div>
      </div>
    </button>
  );
}
