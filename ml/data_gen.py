"""Генератор синтетического журнала явки волонтёров.

Зачем: реальной истории сборов пока нет (данные синтетические — см. README проекта).
Чтобы обучить и честно замерить модель прогноза явки, генерируем правдоподобный
журнал: у каждого волонтёра — латентная надёжность, набор интересов (темы, которые
ему близки) и утомляемость. Вероятность прийти на конкретный сбор зависит от:

  • базовой надёжности волонтёра (как часто вообще доходит);
  • совпадения темы сбора с его интересами (interest_match);
  • личной симпатии к теме (theme affinity — даёт сигнал theme_attendance_rate);
  • ответа на приглашение (yes / maybe / no);
  • «усталости» — сколько сборов он посетил за последние две недели;
  • шума.

ВАЖНО: это генеративная модель ПРАВДЫ (ground truth). Обучаемая модель этих
скрытых параметров не видит — она получает только наблюдаемую историю
(сколько приходил / пропускал, по темам) и должна восстановить сигнал сама.

Результат — «сырой» лог: одна строка = один RSVP волонтёра на один сбор,
в хронологическом порядке. Историю по нему восстанавливает features.py.
"""
import argparse

import numpy as np
import pandas as pd

from config import (
    EVENT_TYPE_IDS, ANSWERS, EVENTS_CSV, RANDOM_SEED,
)

# ── коэффициенты генеративной модели (скрытая «правда») ──
# Подобраны так, чтобы: (1) явка была умеренно сбалансирована (~60% придут),
# (2) сигнал был отчётливым, но не идеальным (ROC-AUC ~0.85), — реалистичный режим.
_INTERCEPT = -0.35         # базовый логит явки (сдвигает баланс классов)
_W_RELIABILITY = 3.4       # вклад надёжности волонтёра
_W_INTEREST = 1.0          # бонус, если тема входит в интересы
_W_THEME_AFF = 1.5         # вклад личной симпатии к конкретной теме
_W_FATIGUE = 0.4           # штраф за «выгорание» (много сборов подряд)
_ANSWER_EFFECT = {"yes": 0.8, "maybe": -0.5, "no": -2.2}
_NOISE_SD = 0.28           # необъяснимый шум — не даёт метрикам стать идеальными


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate_events(
    n_volunteers: int = 1200,
    min_events: int = 4,
    max_events: int = 40,
    seed: int = RANDOM_SEED,
) -> pd.DataFrame:
    """Сгенерировать хронологический журнал RSVP → явка.

    Возвращает DataFrame со столбцами:
      volunteer_id, event_seq, event_day, event_type, answer, interests, came
    Строки отсортированы по (volunteer_id, event_seq) — как приходили события.
    """
    rng = np.random.default_rng(seed)
    rows = []

    for vid in range(n_volunteers):
        # ── статичный «характер» волонтёра ──
        # Смесь: часть народа надёжная, часть — «плюсующие в чат, но не доходящие».
        if rng.random() < 0.38:
            reliability = rng.beta(1.6, 4.6)      # флаки-профиль (mean ≈ 0.26)
        else:
            reliability = rng.beta(4.6, 1.6)      # надёжный профиль (mean ≈ 0.74)

        # Интересы: 1..4 темы. По ним волонтёр ходит чаще и охотнее.
        n_interests = int(rng.integers(1, 5))
        interests = list(rng.choice(EVENT_TYPE_IDS, size=n_interests, replace=False))
        interests_str = "|".join(interests)

        # Личная симпатия к каждой теме (латентная) — сигнал для theme-признаков.
        theme_affinity = {t: rng.random() for t in EVENT_TYPE_IDS}
        for t in interests:
            theme_affinity[t] = min(1.0, theme_affinity[t] + 0.3)

        n_events = int(rng.integers(min_events, max_events + 1))

        # ── таймлайн сборов волонтёра ──
        day = int(rng.integers(0, 30))            # день первого сбора
        recent_attend_days = []                   # дни недавних ЯВОК (для усталости)

        for seq in range(n_events):
            # выбор темы: 60% из интересов (люди тянутся к близкому), 40% случайно
            if interests and rng.random() < 0.6:
                event_type = str(rng.choice(interests))
            else:
                event_type = str(rng.choice(EVENT_TYPE_IDS))

            interest_match = 1 if event_type in interests else 0
            aff = theme_affinity[event_type]

            # ответ на приглашение (RSVP) — тоже зависит от надёжности/интереса
            yes_bias = 0.9 * reliability + 0.5 * interest_match
            probs = np.array([
                0.30 + 0.5 * yes_bias,   # yes
                0.45,                    # maybe
                0.25 - 0.2 * yes_bias,   # no
            ])
            probs = np.clip(probs, 0.03, None)
            probs = probs / probs.sum()
            answer = str(rng.choice(ANSWERS, p=probs))

            # усталость: сколько раз доходил за последние 14 дней
            fatigue = sum(1 for d in recent_attend_days if day - d <= 14)

            logit = (
                _INTERCEPT
                + _W_RELIABILITY * (reliability - 0.5)
                + _W_INTEREST * interest_match
                + _W_THEME_AFF * (aff - 0.5)
                + _ANSWER_EFFECT[answer]
                - _W_FATIGUE * fatigue
                + rng.normal(0.0, _NOISE_SD)
            )
            p_come = _sigmoid(logit)
            came = int(rng.random() < p_come)

            rows.append({
                "volunteer_id": vid,
                "event_seq": seq,
                "event_day": day,
                "event_type": event_type,
                "answer": answer,
                "interests": interests_str,
                "came": came,
            })

            if came:
                recent_attend_days.append(day)
            day += int(rng.integers(3, 31))       # пауза до следующего сбора

    df = pd.DataFrame(rows)
    df = df.sort_values(["volunteer_id", "event_seq"]).reset_index(drop=True)
    return df


def main():
    ap = argparse.ArgumentParser(description="Сгенерировать синтетический журнал явки.")
    ap.add_argument("--volunteers", type=int, default=1200, help="число волонтёров")
    ap.add_argument("--min-events", type=int, default=4)
    ap.add_argument("--max-events", type=int, default=40)
    ap.add_argument("--seed", type=int, default=RANDOM_SEED)
    ap.add_argument("--out", type=str, default=str(EVENTS_CSV))
    args = ap.parse_args()

    df = generate_events(args.volunteers, args.min_events, args.max_events, args.seed)
    df.to_csv(args.out, index=False, encoding="utf-8")

    came_rate = df["came"].mean()
    print(f"Сгенерировано: {len(df):,} записей RSVP от {df['volunteer_id'].nunique():,} волонтёров")
    print(f"Средняя явка (доля came): {came_rate:.3f}")
    print(f"Журнал сохранён → {args.out}")


if __name__ == "__main__":
    main()
