import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useT, useLang } from '../i18n';
import { sourceLabel, verdictLabel, verdictColor, updatedAt } from '../lib/forecastView';
import Icon from './Icon';
import PersonRow from './PersonRow';

// Блок прогноза координатора.
//
// Раньше он звал forecast(participants, ctx) из lib/forecast прямо в браузере — из-за
// этого обученная модель на экран не попадала В ПРИНЦИПЕ, а координатор видел под
// подписью «прогноз» клиентскую формулу. Теперь источник ровно один: forecastView()
// из стора, и он всегда подписан (модель / приблизительная оценка / демо / кэш).
//
// Главный аргумент, что это не пересчёт числа «да», — интервал и строка перехода
// «подтвердили 14 → модель ждёт 21»: три разных числа честно разведены по ролям.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r0 = (v) => (num(v) == null ? null : Math.round(v));
// 11.06 → «11.1», 9 → «9»: десятая доля здесь несёт смысл, хвостовой ноль — шум.
const r1 = (v) => (num(v) == null ? null : String(Math.round(v * 10) / 10));
const pctOf = (p) => (num(p) == null ? null : `${Math.round(p * 100)}%`);

export default function ForecastBlock() {
  const serverForecast = useGatheringStore((s) => s.serverForecast);
  const gathering = useGatheringStore((s) => s.gathering);
  const displayE = useGatheringStore((s) => s.displayE);
  const openSheet = useUiStore((s) => s.openSheet);
  const navigate = useNavigate();
  const t = useT();
  const isRu = useLang() === 'ru';
  const [why, setWhy] = useState(false);

  // forecastView() на фолбэке собирает НОВЫЙ объект при каждом вызове, поэтому селектором
  // его дёргать нельзя: useSyncExternalStore увидит другой снапшот и уйдёт в цикл рендеров.
  // Подписываемся на входы, а сам прогноз берём у стора — источник числа остаётся один.
  const view = useMemo(
    () => useGatheringStore.getState().forecastView(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverForecast, gathering],
  );

  const expected = view ? num(view.expected) : null;
  const hasNumber = expected != null;
  // Пока идёт анимация счёта показываем displayE, но целится он в то же серверное число.
  const shown = num(displayE) != null ? Math.round(displayE) : r0(expected);
  const lo = view ? r0(view.lo) : null;
  const hi = view ? r0(view.hi) : null;
  const needed = view && num(view.needed) != null ? view.needed : num(gathering && gathering.needed);
  const confirmed = view ? num(view.confirmed) : null;
  const isModel = !!view && view.source === 'model' && !view.stale;
  const segments = (view && view.segments) || [];
  const nudge = ((view && view.nudge) || []).slice(0, 5);
  const at = updatedAt(view);
  const src = sourceLabel(view, t);

  const answerLabel = (a) => (a === 'yes' ? t.barComing : a === 'maybe' ? t.barMaybe : a === 'no' ? t.barOut : a || '');
  const answerColor = (a) => (a === 'yes' ? 'var(--yard)' : a === 'maybe' ? 'var(--maybe)' : a === 'no' ? 'var(--out)' : 'var(--ink-3)');
  // Для формулы «модель ждёт» было бы враньём — но слово «прогноз» обязано остаться.
  const expectsLabel = isModel ? t.fcModelExpects : isRu ? 'прогноз' : 'болжам';

  // Плашка о том, что число посчитано не моделью. Заметная, но не кричащая.
  const warnText = !view ? null : view.stale ? t.fcStale : view.demo ? t.fcSourceDemo : view.source !== 'model' ? t.fcSourceFormula : null;
  const warnSub = !warnText
    ? null
    : view.stale
      ? isRu ? 'число из последнего успешного ответа сервера' : 'сервердің соңғы жауабындағы сан'
      : view.demo
        ? isRu ? 'сбор не с сервера — числа демонстрационные' : 'жиын серверден емес — сандар көрсетілім үшін'
        : isRu ? 'модель недоступна, считаем по формуле — оценка грубее' : 'модель қолжетімсіз, формуламен есептейміз — баға дөрекірек';

  return (
    <div style={{ marginBottom: 32, animation: 'erik-rise var(--t-move) var(--ease-out)' }}>
      {/* Слово «прогноз» в подписи обязательно: рядом на экране живут счётчики ответов */}
      <div style={{ fontSize: 13, letterSpacing: '.01em', color: 'var(--ink-3)', marginBottom: 4 }}>{t.forecastLabel}</div>

      {!hasNumber ? (
        // Числа нет — рисуем прочерк. Подставлять сюда счётчик подтвердивших нельзя.
        <>
          <div style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 64, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--ink-3)' }}>—</div>
          <div style={{ marginTop: 8, fontSize: 15, color: 'var(--ink-2)' }}>{t.fcUnavailable}</div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 64, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{shown}</span>
            {/* Интервал вместо «± σ»: главный визуальный довод, что это не пересчёт числа «да» */}
            {lo != null && hi != null && (
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 13 }}>
                {t.fcRange}
                <b style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 14 }}>{lo}–{hi}</b>
              </span>
            )}
          </div>

          {/* Источник числа подписан всегда — молча подставлять формулу вместо модели нельзя */}
          {(src || at) && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--ink-3)' }}>
              {src && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, flex: 'none', background: isModel ? 'var(--yard)' : 'var(--out)' }} />
                  {src}
                </span>
              )}
              {/* «обновлено 14:32» — про момент расчёта прогноза, а не про поллинг ростера */}
              {at && <span style={{ fontFamily: 'var(--fm)' }}>{t.fcUpdated} {at}</span>}
            </div>
          )}

          {/* Переход, а не два числа через точку: счётчик подтвердивших → число прогноза */}
          {confirmed != null && (
            <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: '100%', flexWrap: 'wrap', padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                {t.fcConfirmedToForecast}{' '}
                <b style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 14, color: 'var(--ink-2)' }}>{confirmed}</b>
              </span>
              <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--ink-3)' }}>
                <span style={{ width: 14, height: 1, background: 'currentColor', display: 'block' }} />
                <Icon name="chevronRight" size={13} stroke={2} style={{ marginLeft: -5 }} />
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {expectsLabel}{' '}
                <b style={{ fontFamily: 'var(--fm)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{r0(expected)}</b>
              </span>
            </div>
          )}

          {/* Строка нормы — по вердикту (он считается по ИНТЕРВАЛУ, а не по точке) */}
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 500, color: 'var(--ink-2)' }}>
            {needed != null && <span>{isRu ? `Нужно ${needed}` : `${needed} керек`} · </span>}
            <span style={{ color: verdictColor(view.verdict) }}>{verdictLabel(view.verdict, t)}</span>
            {/* shortBy приходит из того же прогноза — не выводим его сами из E и needed */}
            {view.verdict === 'short' && num(view.shortBy) > 0 && (
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {isRu ? `не хватает ${view.shortBy}` : `${view.shortBy} жетпейді`}</span>
            )}
          </div>

          {warnText && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: 'var(--maybe-soft)' }}>
              <span style={{ flex: 'none', marginTop: 1, color: '#8a5a17' }}><Icon name="eyeOff" size={16} stroke={1.6} /></span>
              <span style={{ minWidth: 0, fontSize: 13, lineHeight: 1.4, color: '#7a5518' }}>
                <b style={{ fontWeight: 600 }}>{warnText}</b>
                {warnSub && <span style={{ display: 'block', color: 'var(--ink-2)' }}>{warnSub}</span>}
              </span>
            </div>
          )}

          {/* «Почему столько»: раскладка по ответам — данные, которых у счётчика нет */}
          {segments.length > 0 && (
            <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', overflow: 'hidden' }}>
              <button
                type="button"
                className="erik-row-hover"
                aria-expanded={why}
                onClick={() => setWhy((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: '12px 14px', border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
              >
                {isRu ? 'Почему столько' : 'Неге сонша'}
                <Icon name="chevronRight" size={16} stroke={1.8} style={{ flex: 'none', color: 'var(--ink-3)', transform: `rotate(${why ? 90 : 0}deg)`, transition: 'transform var(--t-fast) var(--ease-soft)' }} />
              </button>
              {why && (
                <div style={{ padding: '2px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
                  {segments.map((s) => {
                    const cnt = num(s.count) || 0;
                    const exp = num(s.expected);
                    const share = cnt > 0 && exp != null ? Math.max(0, Math.min(100, (exp / cnt) * 100)) : 0;
                    return (
                      <div key={s.answer}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, fontSize: 13, lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--ink-2)' }}>
                            <b style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--ink)' }}>{cnt}</b> {answerLabel(s.answer)}
                          </span>
                          <span style={{ flex: 'none', color: 'var(--ink-3)' }}>
                            {t.fcSegmentOf}{' '}
                            <b style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: answerColor(s.answer) }}>{exp == null ? '—' : r1(exp)}</b>
                          </span>
                        </div>
                        {/* Доля пришедших внутри сегмента: видно, что «да» — это не 100 % */}
                        <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                          <div style={{ width: `${share}%`, height: '100%', background: answerColor(s.answer), transition: 'width var(--t-move) var(--ease-soft)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Ранжировать сомневающихся умеет только модель — у формулы nudge пуст */}
          {nudge.length > 0 && (
            <div style={{ marginTop: 16, padding: '14px 14px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t.fcNudgeTitle}</div>
              <div style={{ marginTop: 2, fontSize: 13, lineHeight: 1.4, color: 'var(--ink-3)' }}>{t.fcNudgeSub}</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
                {nudge.map((p) => (
                  <PersonRow
                    key={p.id}
                    name={p.name}
                    size={30}
                    historyText={answerLabel(p.answer)}
                    style={{ padding: '7px 4px', cursor: 'default' }}
                    right={
                      <span style={{ flex: 'none', textAlign: 'right' }}>
                        <span style={{ display: 'block', fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 14, color: 'var(--maybe)' }}>{pctOf(p.p) || '—'}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{t.fcPersonP}</span>
                      </span>
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                className="erik-btn"
                onClick={() => openSheet('remind')}
                style={{ marginTop: 10, height: 40, padding: '0 16px', border: '1px solid var(--maybe)', background: 'var(--surface)', color: '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}
              >
                {t.remind}
              </button>
            </div>
          )}
        </>
      )}

      <button
        type="button"
        className="erik-btn"
        onClick={() => navigate('/forecast-quality')}
        style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'transparent', color: 'var(--yard)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
      >
        {t.fcQualityLink}
        <Icon name="chevronRight" size={14} stroke={1.8} />
      </button>
    </div>
  );
}
