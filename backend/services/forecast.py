"""Прогноз явки: обученная ML-модель как основной источник, формула — фолбэк.

Два слоя, и порядок между ними важен:

  1. ОСНОВНОЙ — ML-модель (ml/, мост services/attendance_ml.py). Градиентный
     бустинг на 14 причинных признаках с изотонической калибровкой. На отложенном
     тесте со сплитом по волонтёрам: ROC-AUC 0.793, Brier 0.175, Σp попадает в
     фактическую явку с ошибкой 2.3%.
  2. ФОЛБЭК — аналитическая формула p_i = clamp(base·trust·ctx) (порт
     front/src/lib/forecast.js). Работает всегда и без зависимостей, но
     систематически занижает явку (на том же тесте −57%) и ранжирует людей хуже
     модели (ROC-AUC 0.753). Включается, только если модель недоступна, и тогда
     ответ честно помечен source='formula'.

Числа фолбэка обязаны совпадать с клиентом до последнего знака: base входит ДВАЖДЫ
(прямым множителем и внутри trust) — этот квирк сохранён намеренно.
Новичок (total=0): trust == base(answer) → p_i = base(answer)² · ctx.

Ключевой инвариант: ИСТОЧНИК ВЫБИРАЕТСЯ ЦЕЛИКОМ НА СБОР. Смешивать ML-вероятности
одних участников с формульными других нельзя — сумма получилась бы ни тем ни этим,
а по числу нельзя было бы сказать, чем оно посчитано.
"""
import math
from datetime import datetime, timezone

from models import db, User, Participant, AttendanceRecord, ForecastParams, ANSWERS

# Часы, начисляемые за один посещённый сбор (нет длительности в модели — плоско).
DEFAULT_EVENT_HOURS = 4

# Полоса «сомневающихся», где напоминание даёт максимальный эффект: человек ещё не
# решил (p далеко от 0 и от 1), поэтому один толчок реально двигает исход. Границы
# по вероятности МОДЕЛИ — формула такой список построить не может, у неё p зависит
# только от ответа и двух чисел истории.
NUDGE_LO, NUDGE_HI = 0.25, 0.70
NUDGE_LIMIT = 12


# ── чистая математика (принимает объекты с .answer и .history{total,came}) ──

def _trust(base_val, came, total, alpha):
    return (came + alpha * base_val) / (total + alpha)


def probability(answer, history, ctx, p):
    """p_i = clamp(base·trust·ctx, p_min, p_max)."""
    b = p.base(answer)
    tr = _trust(b, history.get('came', 0), history.get('total', 0), p.alpha)
    val = b * tr * ctx
    return max(p.p_min, min(p.p_max, val))


def compute_forecast(participants, ctx=1.0, params=None, prob_fn=None):
    """participants: iterable объектов с .answer и .history.
    → {E, sigma, lo, hi, counts, segments, ctx}.

    prob_fn(part) -> float|None подменяет источник ВЕРОЯТНОСТИ, а не готовой суммы.
    Так σ, lo/hi и разбивка по сегментам пересчитываются тем же кодом и остаются
    согласованными с E (иначе sum(segments.expected) != E и payload врал бы сам себе).
    """
    p = params or ForecastParams.get()
    E = 0.0
    varsum = 0.0
    # агрегаты по сегментам ответа для Полосы явки
    seg = {a: {'count': 0, 'expected': 0.0} for a in ANSWERS}

    for part in participants:
        answer = part.answer
        if answer not in ANSWERS:
            continue
        pi = prob_fn(part) if prob_fn is not None else None
        if pi is None:
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


def _verdict(lo, hi, needed):
    """Хватит ли людей — по ИНТЕРВАЛУ, а не по одной точке.

    'enough' — хватит даже по пессимистичному краю; 'short' — не хватит даже по
    оптимистичному; 'risky' — норма внутри интервала. Цвет карточки перестаёт
    прыгать от одного ответа, а координатор видит не «22 против 20», а «решится».
    """
    if not needed:
        return 'enough'
    if lo >= needed:
        return 'enough'
    if hi < needed:
        return 'short'
    return 'risky'


# Кэш прогноза: /poll дёргается раз в 10 секунд на каждого координатора, а с ML
# каждый тик — это проход модели по всему ростеру. Ключ включает отпечаток ростера,
# поэтому кэш не переживает ни смену ответа, ни приход нового человека.
_CACHE = {}
_CACHE_MAX = 256


def _fingerprint(gathering):
    return (
        gathering.id,
        gathering.revision,
        gathering.needed,
        tuple(sorted((p.id, p.answer) for p in gathering.participants)),
    )


def invalidate(gathering_id=None):
    """Сбросить кэш прогноза (целиком или по одному сбору)."""
    if gathering_id is None:
        _CACHE.clear()
        return
    for key in [k for k in _CACHE if k[0] == gathering_id]:
        _CACHE.pop(key, None)


def forecast_payload(gathering, params=None, include_people=False, prefer_ml=True):
    """Готовый ответ для GET /gatherings/:id/forecast и поля forecast в других payload.

    include_people=True добавляет `nudge` — поимённый список сомневающихся. Только
    для owner-вида: там есть имена, в публичные ответы это уходить не должно.
    """
    return forecast_with_probs(gathering, params, include_people, prefer_ml)[0]


def forecast_with_probs(gathering, params=None, include_people=False, prefer_ml=True):
    """→ (payload, {participant_id: p} | None).

    Карта вероятностей нужна owner-сериализатору, чтобы поставить p каждому человеку
    в ростере, но в самом JSON прогноза она была бы дублем — поэтому отдаётся рядом.
    """
    key = _fingerprint(gathering) + (include_people, prefer_ml)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    # Импорт внутри функции намеренно: бэкенд обязан подниматься и работать без
    # numpy/sklearn, а ленивый импорт держит это свойство.
    from services import attendance_ml

    ctx = gathering.ctx or 1.0
    probs = attendance_ml.probabilities(gathering) if prefer_ml else None

    if probs is not None:
        f = compute_forecast(gathering.participants, ctx, params,
                             prob_fn=lambda part: probs.get(part.id))
        f['source'] = 'model'
        f['model'] = attendance_ml.model_info()
        f['fallbackReason'] = None
    else:
        f = compute_forecast(gathering.participants, ctx, params)
        f['source'] = 'formula'
        f['model'] = None
        # При prefer_ml=False это не поломка, а осознанный выбор источника.
        f['fallbackReason'] = attendance_ml.status() if prefer_ml else 'forced'

    # Что дала бы наивная оценка «сколько нажало "приду"» — то самое число, с
    # которым прогноз путают. Отдаём рядом, чтобы фронт мог показать переход
    # «подтвердили 14 → модель ждёт 20» вместо двух похожих чисел через точку.
    f['baseline'] = {'confirmed': f['counts']['yes'], 'answered': f['counts']['total']}

    f['E'] = round(f['E'], 1)
    f['sigma'] = round(f['sigma'], 1)
    f['lo'] = round(f['lo'], 1)
    f['hi'] = round(f['hi'], 1)
    f['expected'] = f['E']                 # читаемое имя рядом с легаси-ключом
    f['needed'] = gathering.needed
    f['verdict'] = _verdict(f['lo'], f['hi'], gathering.needed)
    f['shortBy'] = max(0, (gathering.needed or 0) - round(f['E']))
    f['computed_at'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    f['computedAt'] = f['computed_at']

    if include_people:
        f['nudge'] = _nudge_list(gathering, probs)

    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.clear()
    _CACHE[key] = (f, probs)
    return f, probs


def _nudge_list(gathering, probs):
    """Кому напоминание даст больше всего — по НЕОПРЕДЕЛЁННОСТИ оценки модели.

    Сортируем не по величине вероятности, а по p·(1−p): она максимальна у тех, кто
    ближе всего к 50/50, а значит именно там напоминание реально меняет исход.
    Человек с p=0.95 придёт и без письма, с p=0.05 — не придёт и с письмом.
    При равной неопределённости выше идёт «может быть»: он ещё не решил.

    Ранжирование внутри одного ответа доступно только модели: у формулы p зависит
    от (answer, came, total), и два «может быть» с разной темой и свежестью для неё
    неразличимы. Поэтому при source='formula' список пустой — выдумывать приоритет,
    которого нет, нельзя.
    """
    if not probs:
        return []
    rows = []
    for part in gathering.participants:
        p = probs.get(part.id)
        if p is None or part.answer == 'no':
            continue
        if NUDGE_LO <= p <= NUDGE_HI:
            rows.append({
                'id': part.id,
                'name': part.name,
                'answer': part.answer,
                'p': round(p, 3),
            })
    rows.sort(key=lambda r: (r['p'] * (1 - r['p']), r['answer'] == 'maybe'), reverse=True)
    return rows[:NUDGE_LIMIT]


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
    # Явка обучила trust этих людей — прогнозы ДРУГИХ сборов с их участием
    # устарели, а их ревизия не менялась. Чистим кэш целиком.
    invalidate()
    return {
        'status': 'done',
        'finalized_at': now.isoformat().replace('+00:00', 'Z'),
        'came': sum(1 for p in gathering.participants if p.presence == 'came'),
        'missed': sum(1 for p in gathering.participants if p.presence == 'missed'),
    }
