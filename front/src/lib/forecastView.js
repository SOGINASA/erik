// Единая нормализация прогноза для всех экранов.
//
// Раньше «сколько придёт» рождалось в четырёх независимых местах: клиентская копия
// формулы (lib/forecast.js), вторая формула по счётчикам (data.js:estimateAttendance),
// сырой счётчик «идут» в ленте и ML-чип на экране координатора. Числа расходились
// между экранами для одного и того же сбора — отсюда и претензия, что прогноз
// «просто повторяет число подтвердивших».
//
// Здесь ровно один вход: объект forecast с сервера. Если его нет, вызывающий сам
// решает, показывать ли фолбэк — и тогда источник помечается явно.

import { forecast as fallbackForecast, counts as fallbackCounts } from './forecast';

export const SOURCE = { MODEL: 'model', FORMULA: 'formula', DEMO: 'demo' };

// Подпись источника числа. Показывать обязательно: пользователь имеет право знать,
// смотрит он на модель, на грубую оценку или на демо-данные.
export function sourceLabel(view, t) {
  if (!view) return null;
  if (view.demo) return t.fcSourceDemo;
  if (view.stale) return t.fcStale;
  if (view.source === SOURCE.MODEL) {
    const name = view.model && view.model.name;
    return name ? `${t.fcSourceModel} · ${name}` : t.fcSourceModel;
  }
  return t.fcSourceFormula;
}

export function verdictLabel(verdict, t) {
  if (verdict === 'enough') return t.fcVerdictEnough;
  if (verdict === 'short') return t.fcVerdictShort;
  return t.fcVerdictRisky;
}

// Цвет числа по вердикту (по интервалу, а не по точке — иначе цвет прыгает от
// одного ответа).
export function verdictColor(verdict) {
  if (verdict === 'enough') return 'var(--yard)';
  if (verdict === 'short') return 'var(--out)';
  return 'var(--maybe)';
}

/**
 * Нормализовать серверный прогноз к виду, который рисуют компоненты.
 * @param {object|null} server  поле forecast из ответа API
 * @param {object} opts { stale?: boolean }
 */
export function fromServer(server, opts = {}) {
  if (!server) return null;
  const counts = server.counts || { yes: 0, maybe: 0, no: 0, total: 0 };
  return {
    expected: server.expected != null ? server.expected : server.E,
    sigma: server.sigma,
    lo: server.lo,
    hi: server.hi,
    needed: server.needed,
    verdict: server.verdict || 'risky',
    shortBy: server.shortBy || 0,
    source: server.source || SOURCE.FORMULA,
    model: server.model || null,
    fallbackReason: server.fallbackReason || null,
    counts,
    confirmed: (server.baseline && server.baseline.confirmed) != null
      ? server.baseline.confirmed
      : counts.yes,
    segments: server.segments || [],
    nudge: server.nudge || [],
    computedAt: server.computedAt || server.computed_at || null,
    stale: !!opts.stale,
    demo: false,
  };
}

/**
 * Фолбэк из локального ростера — только когда сервера нет вовсе.
 * Всегда помечен source='formula' (или demo), чтобы UI не выдавал его за модель.
 */
export function fromParticipants(participants, ctx, needed, opts = {}) {
  const list = participants || [];
  const f = fallbackForecast(list, ctx == null ? 1 : ctx);
  const c = fallbackCounts(list);
  const lo = f.lo;
  const hi = f.hi;
  return {
    expected: round1(f.E),
    sigma: round1(f.sigma),
    lo: round1(lo),
    hi: round1(hi),
    needed,
    verdict: verdictOf(lo, hi, needed),
    shortBy: Math.max(0, (needed || 0) - Math.round(f.E)),
    source: opts.demo ? SOURCE.DEMO : SOURCE.FORMULA,
    model: null,
    fallbackReason: opts.reason || null,
    counts: c,
    confirmed: c.yes,
    segments: [],
    nudge: [],           // ранжировать сомневающихся умеет только модель
    computedAt: null,
    stale: !!opts.stale,
    demo: !!opts.demo,
  };
}

export function verdictOf(lo, hi, needed) {
  if (!needed) return 'enough';
  if (lo >= needed) return 'enough';
  if (hi < needed) return 'short';
  return 'risky';
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

// «обновлено 14:32» — про момент расчёта прогноза, а не про поллинг ростера.
export function updatedAt(view) {
  if (!view || !view.computedAt) return null;
  const d = new Date(view.computedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
