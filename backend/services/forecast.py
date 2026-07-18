"""Мат-модель прогноза явки — серверный порт front/src/lib/forecast.js.

Числа обязаны совпадать с клиентом до последнего знака: base входит ДВАЖДЫ
(прямым множителем и внутри trust) — этот квирк сохранён намеренно.
Новичок (total=0): trust == base(answer) → p_i = base(answer)² · ctx.
"""
import math
from datetime import datetime, timezone

from models import db, User, Participant, AttendanceRecord, ForecastParams, ANSWERS

# Часы, начисляемые за один посещённый сбор (нет длительности в модели — плоско).
DEFAULT_EVENT_HOURS = 4


# ── чистая математика (принимает объекты с .answer и .history{total,came}) ──

def _trust(base_val, came, total, alpha):
    return (came + alpha * base_val) / (total + alpha)


def probability(answer, history, ctx, p):
    """p_i = clamp(base·trust·ctx, p_min, p_max)."""
    b = p.base(answer)
    tr = _trust(b, history.get('came', 0), history.get('total', 0), p.alpha)
    val = b * tr * ctx
    return max(p.p_min, min(p.p_max, val))


def compute_forecast(participants, ctx=1.0, params=None):
    """participants: iterable объектов с .answer и .history.
    → {E, sigma, lo, hi, counts, segments, ctx}."""
    p = params or ForecastParams.get()
    E = 0.0
    varsum = 0.0
    # агрегаты по сегментам ответа для Полосы явки
    seg = {a: {'count': 0, 'expected': 0.0} for a in ANSWERS}

    for part in participants:
        answer = part.answer
        if answer not in ANSWERS:
            continue
        pi = probability(answer, part.history, ctx, p)
        E += pi
        varsum += pi * (1 - pi)
        seg[answer]['count'] += 1
        seg[answer]['expected'] += pi

    sigma = math.sqrt(varsum)
    k = p.sigma_k
    segments = [
        {
            'answer': a,
            'count': seg[a]['count'],
            'expected': round(seg[a]['expected'], 2),
            'p_avg': round(seg[a]['expected'] / seg[a]['count'], 3) if seg[a]['count'] else 0.0,
        }
        for a in ANSWERS
    ]
    return {
        'E': E,
        'sigma': sigma,
        'lo': max(0.0, E - k * sigma),
        'hi': E + k * sigma,
        'counts': {
            'yes': seg['yes']['count'],
            'maybe': seg['maybe']['count'],
            'no': seg['no']['count'],
            'total': seg['yes']['count'] + seg['maybe']['count'] + seg['no']['count'],
        },
        'segments': segments,
        'ctx': ctx,
    }


def forecast_payload(gathering, params=None):
    """Готовый ответ для GET /gatherings/:id/forecast."""
    f = compute_forecast(gathering.participants, gathering.ctx or 1.0, params)
    f['E'] = round(f['E'], 1)
    f['sigma'] = round(f['sigma'], 1)
    f['lo'] = round(f['lo'], 1)
    f['hi'] = round(f['hi'], 1)
    f['needed'] = gathering.needed
    f['computed_at'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    return f


# ── обучение: пересчёт trust и финализация сбора ──

def recompute_user_trust(user):
    """Пересчитать агрегаты пользователя из журнала AttendanceRecord (идемпотентно)."""
    rows = AttendanceRecord.query.filter_by(user_id=user.id).all()
    total = len(rows)
    came = sum(1 for r in rows if r.presence == 'came')
    user.trust_total = total
    user.trust_came = came
    user.reliability = round(100 * came / total) if total else 0
    user.events_attended = came
    user.hours_total = sum((r.hours_credited or 0) for r in rows)


def finalize_gathering(gathering):
    """Закрыть сбор: проставить presence, записать журнал, обучить trust.

    Логика 1-в-1 из useGatheringStore.finishGathering:
      отмечен came → came; не отмечен и answer!=no → missed; answer==no → без записи.
    """
    now = datetime.now(timezone.utc)
    affected_user_ids = set()

    for part in gathering.participants:
        if part.answer == 'no':
            part.presence = None
            continue
        presence = 'came' if part.presence == 'came' else 'missed'
        part.presence = presence
        part.checked_in_at = part.checked_in_at or now

        if part.user_id:
            rec = AttendanceRecord.query.filter_by(
                user_id=part.user_id, gathering_id=gathering.id
            ).first()
            hours = DEFAULT_EVENT_HOURS if presence == 'came' else 0
            if rec is None:
                rec = AttendanceRecord(
                    user_id=part.user_id, gathering_id=gathering.id,
                    answer=part.answer, presence=presence, hours_credited=hours,
                )
                db.session.add(rec)
            else:
                rec.answer = part.answer
                rec.presence = presence
                rec.hours_credited = hours
            affected_user_ids.add(part.user_id)

    gathering.status = 'done'
    gathering.finalized_at = now
    gathering.bump()
    db.session.flush()

    from services.notifications import award_badges
    for uid in affected_user_ids:
        user = db.session.get(User, uid)
        if user:
            recompute_user_trust(user)
            award_badges(user)
    owner = db.session.get(User, gathering.owner_id)
    if owner and owner.id not in affected_user_ids:
        award_badges(owner)   # 'lead' за проведённый сбор

    db.session.commit()
    return {
        'status': 'done',
        'finalized_at': now.isoformat().replace('+00:00', 'Z'),
        'came': sum(1 for p in gathering.participants if p.presence == 'came'),
        'missed': sum(1 for p in gathering.participants if p.presence == 'missed'),
    }
