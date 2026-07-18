"""Контекст-множитель ctx для прогноза явки (P2b).

Заменяет «магическую» константу (0.95 в демо) на осмысленный множитель из:
  • дня недели (выходные приходят охотнее буднего вечера),
  • lead-time — сколько дней между созданием и сбором (слишком скоро/слишком далеко хуже),
  • погоды — пока заглушка 1.0 (позже: прогноз на день сбора по внешнему API).

ctx считается ОДИН раз при создании сбора и хранится (`Gathering.ctx`), чтобы фронт
(который берёт ctx из API и сам считает прогноз) и бэкенд давали одно и то же число.
Диапазон зажат в [0.7, 1.1].
"""
from datetime import datetime, timezone

W_WEEKEND = 1.05   # сб/вс
W_FRIDAY = 1.00
W_WEEKDAY = 0.95   # пн–чт


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def weekday_factor(starts_at):
    wd = starts_at.weekday()   # 0=Пн … 6=Вс
    if wd >= 5:
        return W_WEEKEND
    if wd == 4:
        return W_FRIDAY
    return W_WEEKDAY


def lead_factor(starts_at, created_at):
    days = (_aware(starts_at) - _aware(created_at)).total_seconds() / 86400.0
    if days < 0.5:
        return 0.90    # сегодня/уже прошёл — не успевают собраться
    if days <= 7:
        return 1.00    # оптимальное окно
    if days <= 21:
        return 0.95    # далеко — часть забудет
    return 0.90        # очень далеко


def weather_factor(starts_at):
    return 1.0         # заглушка: без внешнего API прогноза погоды


def ctx_factors(starts_at, created_at=None):
    """Разбивка множителей (для прозрачности/Q&A)."""
    now = created_at or datetime.now(timezone.utc)
    return {
        'weekday': weekday_factor(starts_at),
        'lead': lead_factor(starts_at, now),
        'weather': weather_factor(starts_at),
    }


def compute_ctx(starts_at, created_at=None):
    """Итоговый ctx ∈ [0.7, 1.1]. starts_at=None → 1.0 (нейтрально)."""
    if starts_at is None:
        return 1.0
    f = ctx_factors(starts_at, created_at)
    ctx = f['weekday'] * f['lead'] * f['weather']
    return round(max(0.7, min(1.1, ctx)), 3)
