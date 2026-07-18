// Мат-модель прогноза явки (ядро продукта, TVEP стр. 3).
// Не ИИ-обёртка — собственный алгоритм на сглаживании Лапласа и сумме Бернулли.

export const ALPHA = 3;
export const BASE = { yes: 0.62, maybe: 0.24, no: 0.02 };

// Стартовая вероятность прихода по ответу (из CustDev).
export function base(answer) {
  return answer in BASE ? BASE[answer] : BASE.no;
}

// Доверие к человеку по его истории, сглаженное по Лапласу:
// новичок без истории не ломает прогноз — его trust равен base(answer).
export function trust(participant) {
  const b = base(participant.answer);
  const { came, total } = participant.history;
  return (came + ALPHA * b) / (total + ALPHA);
}

// Индивидуальная вероятность p_i, зажатая в [0.02, 0.98].
export function probability(participant, ctx = 1) {
  const p = base(participant.answer) * trust(participant) * ctx;
  return Math.max(0.02, Math.min(0.98, p));
}

// Прогноз E = Σ p_i и разброс σ = sqrt(Σ p_i·(1−p_i)); интервал ≈ E ± 2σ.
export function forecast(participants, ctx = 1) {
  let E = 0;
  let varsum = 0;
  for (const p of participants) {
    const pi = probability(p, ctx);
    E += pi;
    varsum += pi * (1 - pi);
  }
  const sigma = Math.sqrt(varsum);
  return { E, sigma, lo: Math.max(0, E - 2 * sigma), hi: E + 2 * sigma };
}

// Разбивка по ответам.
export function counts(participants) {
  return {
    yes: participants.filter((x) => x.answer === 'yes').length,
    maybe: participants.filter((x) => x.answer === 'maybe').length,
    no: participants.filter((x) => x.answer === 'no').length,
    total: participants.length,
  };
}
