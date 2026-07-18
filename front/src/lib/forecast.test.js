import { base, trust, probability, forecast, counts, ALPHA } from './forecast';

const P = (answer, total, came) => ({ answer, history: { total, came } });

describe('base', () => {
  test('стартовые вероятности из CustDev', () => {
    expect(base('yes')).toBe(0.62);
    expect(base('maybe')).toBe(0.24);
    expect(base('no')).toBe(0.02);
  });
  test('неизвестный ответ трактуется как отказ', () => {
    expect(base('whatever')).toBe(0.02);
  });
});

describe('trust — сглаживание Лапласа', () => {
  test('новичок без истории: trust равен base(answer)', () => {
    // (0 + α·b) / (0 + α) === b
    expect(trust(P('yes', 0, 0))).toBeCloseTo(base('yes'), 10);
    expect(trust(P('maybe', 0, 0))).toBeCloseTo(base('maybe'), 10);
  });
  test('надёжный человек (5 из 5) тянет trust вверх относительно base', () => {
    expect(trust(P('yes', 5, 5))).toBeGreaterThan(base('yes'));
  });
  test('прогульщик (0 из 5) тянет trust вниз относительно base', () => {
    expect(trust(P('yes', 5, 0))).toBeLessThan(base('yes'));
  });
  test('формула: came=4,total=5,yes → (4+3·0.62)/(5+3)', () => {
    expect(trust(P('yes', 5, 4))).toBeCloseTo((4 + ALPHA * 0.62) / (5 + ALPHA), 10);
  });
});

describe('probability — зажатие в [0.02, 0.98]', () => {
  test('никогда не ниже 0.02', () => {
    expect(probability(P('no', 0, 0), 0.95)).toBeGreaterThanOrEqual(0.02);
  });
  test('никогда не выше 0.98', () => {
    // экстремально надёжный, высокий контекст
    expect(probability(P('yes', 50, 50), 3)).toBeLessThanOrEqual(0.98);
  });
  test('надёжный «да» вероятнее ненадёжного «да»', () => {
    expect(probability(P('yes', 5, 5))).toBeGreaterThan(probability(P('yes', 5, 1)));
  });
  test('«да» вероятнее «может» вероятнее «нет» при прочих равных', () => {
    expect(probability(P('yes', 0, 0))).toBeGreaterThan(probability(P('maybe', 0, 0)));
    expect(probability(P('maybe', 0, 0))).toBeGreaterThan(probability(P('no', 0, 0)));
  });
});

describe('forecast — E, σ, интервал', () => {
  test('пустой сбор даёт нулевой прогноз', () => {
    const f = forecast([]);
    expect(f.E).toBe(0);
    expect(f.sigma).toBe(0);
    expect(f.lo).toBe(0);
    expect(f.hi).toBe(0);
  });
  test('E равен сумме индивидуальных вероятностей', () => {
    const people = [P('yes', 0, 0), P('maybe', 0, 0), P('no', 0, 0)];
    const f = forecast(people, 0.95);
    const manual = people.reduce((s, p) => s + probability(p, 0.95), 0);
    expect(f.E).toBeCloseTo(manual, 10);
  });
  test('интервал lo..hi окружает E и не уходит ниже нуля', () => {
    const people = Array.from({ length: 20 }, () => P('maybe', 3, 1));
    const f = forecast(people, 0.95);
    expect(f.lo).toBeGreaterThanOrEqual(0);
    expect(f.lo).toBeLessThanOrEqual(f.E);
    expect(f.hi).toBeGreaterThanOrEqual(f.E);
  });
  test('обучение на данных: та же группа с лучшей историей → выше прогноз', () => {
    const weak = Array.from({ length: 10 }, () => P('yes', 4, 1));
    const strong = Array.from({ length: 10 }, () => P('yes', 4, 4));
    expect(forecast(strong).E).toBeGreaterThan(forecast(weak).E);
  });
});

describe('counts', () => {
  test('считает по каждому ответу и всего', () => {
    const people = [P('yes', 0, 0), P('yes', 0, 0), P('maybe', 0, 0), P('no', 0, 0)];
    expect(counts(people)).toEqual({ yes: 2, maybe: 1, no: 1, total: 4 });
  });
});
