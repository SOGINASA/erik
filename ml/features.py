"""Инженерия признаков — ЕДИНАЯ для обучения и инференса.

Главный принцип: признаки для сбора №k считаются ТОЛЬКО по истории сборов 1..k-1
(причинно, без заглядывания в будущее) — иначе была бы утечка и завышенные метрики.

Низкоуровневая `compute_feature_row()` принимает уже агрегированную историю
(сколько приходил / пропускал, разбивка по темам, свежесть) и собирает вектор
признаков. Её вызывают:

  • `build_training_frame()`   — проходит журнал по каждому волонтёру и накапливает
                                 историю пошагово (для train.py / evaluate.py);
  • `features_from_history()`  — собирает ОДНУ строку по агрегатам, которые легко
                                 отдаёт бэкенд (для inference.py и API).

Так у обучения и продакшена гарантированно одинаковый вектор — нет train/serve skew.
"""
import pandas as pd

from config import (
    ALL_FEATURES, TARGET, LAPLACE_ALPHA, PRIOR_ATTENDANCE, RECENT_WINDOW,
)


# ─────────────────────────────────────────────────────────────────────────────
#  Низкоуровневая сборка вектора признаков из агрегатов истории
# ─────────────────────────────────────────────────────────────────────────────
def compute_feature_row(
    *,
    events_total: int,
    events_came: int,
    theme_total: int,
    theme_came: int,
    recent_came_rate: float,
    days_since_last: float,
    interest_match: int,
    num_interests: int,
    answer: str,
    event_type: str,
) -> dict:
    """Собрать словарь признаков (ключи = ALL_FEATURES) из агрегатов истории.

    Все производные (attendance_rate, reliability, ...) считаются здесь — в одном
    месте, чтобы train и inference были идентичны.
    """
    events_missed = max(0, events_total - events_came)

    # Явка со сглаживанием Лапласа (перекликается с trust из forecast.js):
    #   (came + α·prior) / (total + α). Для новичка → prior.
    attendance_rate = (events_came + LAPLACE_ALPHA * PRIOR_ATTENDANCE) / (
        events_total + LAPLACE_ALPHA
    )
    reliability = round(100 * events_came / events_total) if events_total > 0 else round(
        100 * PRIOR_ATTENDANCE
    )
    theme_attendance_rate = (theme_came + LAPLACE_ALPHA * PRIOR_ATTENDANCE) / (
        theme_total + LAPLACE_ALPHA
    )

    return {
        "events_total": events_total,
        "events_came": events_came,
        "events_missed": events_missed,
        "attendance_rate": attendance_rate,
        "reliability": reliability,
        "recent_came_rate": recent_came_rate,
        "days_since_last": days_since_last,
        "theme_total": theme_total,
        "theme_came": theme_came,
        "theme_attendance_rate": theme_attendance_rate,
        "interest_match": int(interest_match),
        "num_interests": int(num_interests),
        "answer": answer,
        "event_type": event_type,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Построение обучающей матрицы из «сырого» журнала (data_gen.py → CSV)
# ─────────────────────────────────────────────────────────────────────────────
def build_training_frame(events: pd.DataFrame) -> pd.DataFrame:
    """Из хронологического журнала RSVP собрать матрицу (признаки + таргет).

    Для каждого сбора признаки берутся из ИСТОРИИ волонтёра ДО этого сбора,
    таргет — фактическая явка (came) на этот сбор.
    """
    events = events.sort_values(["volunteer_id", "event_seq"])
    out_rows = []

    for _vid, grp in events.groupby("volunteer_id", sort=False):
        # накопители истории волонтёра
        total = 0
        came = 0
        theme_total: dict[str, int] = {}
        theme_came: dict[str, int] = {}
        recent: list[int] = []             # последние RECENT_WINDOW исходов (0/1)
        last_day = None

        for row in grp.itertuples(index=False):
            interests = str(row.interests).split("|") if row.interests else []
            et = row.event_type

            recent_rate = sum(recent) / len(recent) if recent else PRIOR_ATTENDANCE
            days_since = (row.event_day - last_day) if last_day is not None else 30.0

            feat = compute_feature_row(
                events_total=total,
                events_came=came,
                theme_total=theme_total.get(et, 0),
                theme_came=theme_came.get(et, 0),
                recent_came_rate=recent_rate,
                days_since_last=days_since,
                interest_match=1 if et in interests else 0,
                num_interests=len(interests),
                answer=row.answer,
                event_type=et,
            )
            feat[TARGET] = int(row.came)
            feat["volunteer_id"] = row.volunteer_id      # для группового сплита
            out_rows.append(feat)

            # ── обновляем историю ПОСЛЕ того, как признаки уже собраны ──
            total += 1
            came += int(row.came)
            theme_total[et] = theme_total.get(et, 0) + 1
            theme_came[et] = theme_came.get(et, 0) + int(row.came)
            recent.append(int(row.came))
            if len(recent) > RECENT_WINDOW:
                recent.pop(0)
            last_day = row.event_day

    frame = pd.DataFrame(out_rows)
    return frame


def split_X_y(frame: pd.DataFrame):
    """Разделить матрицу на X (только ALL_FEATURES) и y (таргет)."""
    X = frame[ALL_FEATURES].copy()
    y = frame[TARGET].astype(int).copy()
    return X, y


# ─────────────────────────────────────────────────────────────────────────────
#  Одна строка признаков для инференса (дружелюбный к бэкенду вход)
# ─────────────────────────────────────────────────────────────────────────────
def features_from_history(history: dict, event: dict) -> pd.DataFrame:
    """Собрать матрицу 1×N для предсказания по агрегатам, которые есть у бэкенда.

    history (всё, кроме came/total, — опционально, есть разумные значения по умолчанию):
        came            : на скольких сборах волонтёр был            (User.trust_came)
        total           : сколько сборов было в истории              (User.trust_total)
                          (или missed — тогда total = came + missed)
        missed          : сколько пропустил (альтернатива total)
        theme_came      : на скольких сборах ЭТОЙ темы был           (по желанию)
        theme_total     : сколько сборов ЭТОЙ темы было              (по желанию)
        recent_came_rate: доля явок за последние сборы 0..1          (по желанию)
        days_since_last : дней с последнего сбора                    (по желанию)
        interests       : список тем волонтёра, напр. ['eco','edu']  (для interest_match)

    event:
        event_type : тип текущего сбора (id темы, напр. 'eco')
        answer     : ответ на приглашение 'yes' | 'maybe' | 'no'

    Возвращает DataFrame из одной строки со столбцами ALL_FEATURES — сразу в модель.
    """
    came = int(history.get("came", 0))
    if "total" in history:
        total = int(history["total"])
    else:
        total = came + int(history.get("missed", 0))
    total = max(total, came)                      # защита от рассогласования

    interests = history.get("interests", []) or []
    et = event["event_type"]

    feat = compute_feature_row(
        events_total=total,
        events_came=came,
        theme_total=int(history.get("theme_total", 0)),
        theme_came=int(history.get("theme_came", 0)),
        recent_came_rate=float(history.get(
            "recent_came_rate",
            (came / total) if total > 0 else PRIOR_ATTENDANCE,
        )),
        days_since_last=float(history.get("days_since_last", 30.0)),
        interest_match=1 if et in interests else 0,
        num_interests=len(interests),
        answer=event.get("answer", "maybe"),
        event_type=et,
    )
    return pd.DataFrame([feat])[ALL_FEATURES]
