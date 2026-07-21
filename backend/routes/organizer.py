"""P3: организатор (Manage HQ) и заявки на событие.

«mine» = сборы, где текущий пользователь владелец (owner_id) ИЛИ со-координатор
(GatheringCoordinator) — покрывает и НКО-владельца, и координатора.

Заявка (Application) ≠ RSVP: RSVP — мгновенный самозапис; заявка несёт скиллы и
сообщение и ждёт решения организатора. При accept сервер создаёт Participant('yes').
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g

from models import (
    db, User, Gathering, GatheringCoordinator, Participant,
    Application, AttendanceRecord, Notification, ANSWERS,
    APPLICATION_SKILLS, APPLICATION_STATUSES,
)
from utils.decorators import profiled_required, gathering_owner_required, rate_limit
from utils.serializers import (
    serialize_org_event, serialize_application, serialize_org_volunteer,
)

organizer_bp = Blueprint('organizer', __name__)

# Статусы, при которых сбор закрыт для НОВЫХ заявок и accept: завершён или отклонён
# модерацией. Именно поле status (не вычисляемый по дате 'done') — decline при этом
# остаётся возможным, чтобы организатор мог прибраться в ростере закрытого события.
_CLOSED_STATUSES = ('done', 'rejected')


class _BadPage(Exception):
    """Мусорные limit/offset → 400 через errorhandler блюпринта (см. _page_args)."""
    def __init__(self, message):
        super().__init__(message)
        self.message = message


class _GatheringClosed(Exception):
    """accept/подача на завершённый или отклонённый сбор → 409 (см. _closed_response)."""


def _closed_response():
    """409 «Сбор завершён» — единый ответ для accept и подачи заявки (RU + KZ)."""
    return jsonify({'error': 'Сбор завершён', 'errorKz': 'Жиын аяқталды'}), 409


@organizer_bp.errorhandler(_BadPage)
def _on_bad_page(e):
    return jsonify({'error': e.message}), 400


@organizer_bp.errorhandler(_GatheringClosed)
def _on_gathering_closed(e):
    return _closed_response()


def _now():
    return datetime.now(timezone.utc)


def _my_gathering_ids(user):
    """id сборов, где я владелец или со-координатор (без удалённых)."""
    owned = db.session.query(Gathering.id).filter(
        Gathering.owner_id == user.id, Gathering.status != 'deleted').all()
    coord = (db.session.query(GatheringCoordinator.gathering_id)
             .join(Gathering, Gathering.id == GatheringCoordinator.gathering_id)
             .filter(GatheringCoordinator.user_id == user.id,
                     Gathering.status != 'deleted').all())
    return {r[0] for r in owned} | {r[0] for r in coord}


def _owns_gathering(user, gathering):
    if gathering is None or gathering.status == 'deleted':
        return False
    if gathering.owner_id == user.id:
        return True
    return db.session.query(GatheringCoordinator.id).filter_by(
        gathering_id=gathering.id, user_id=user.id).first() is not None


def _page_args():
    """Опциональные limit/offset из query (идиома /api/events).

    Без параметра limit → (None, 0): отдаём всё, обратная совместимость. Если limit
    ЗАДАН, он обязан быть целым положительным числом. Мусор (нечисло, дробь, 0 или
    отрицательное) → 400 `_BadPage`, а НЕ тихое «1» и не тихое отключение пагинации
    (тогда фронт не получал total и думал, что пришёл весь список). Валидный limit
    зажимаем в [1, 200]; offset проверяем только когда есть limit (без него не влияет).
    limit=0 трактуем как невалидный (нужен хотя бы 1 элемент) — задокументировано."""
    raw_limit = request.args.get('limit')
    if raw_limit is None or raw_limit == '':
        return None, 0
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        raise _BadPage('Параметр limit должен быть целым положительным числом')
    if limit <= 0:
        raise _BadPage('Параметр limit должен быть целым положительным числом')
    limit = min(200, limit)

    raw_offset = request.args.get('offset')
    if raw_offset is None or raw_offset == '':
        return limit, 0
    try:
        offset = int(raw_offset)
    except (TypeError, ValueError):
        raise _BadPage('Параметр offset должен быть целым неотрицательным числом')
    if offset < 0:
        raise _BadPage('Параметр offset должен быть целым неотрицательным числом')
    return limit, offset


def _status_arg(allowed):
    """?status=... с валидацией по списку. Нет параметра → 'all'; чужое значение → None."""
    value = (request.args.get('status') or 'all').strip()
    return value if value in allowed else None


def _is_done(gathering, today):
    """Завершён ли сбор. Правило то же, что у serializers._org_event_status,
    но копия локальная: serializers — чужой файл, на приватку не завязываемся."""
    if gathering.status == 'done' or gathering.finalized_at is not None:
        return True
    return gathering.starts_at is not None and gathering.starts_at.date() < today


def _applications_payload(q, status, limit, offset):
    """Общий листинг заявок (по всем моим сборам и по одному) — один shape на оба.
    id в сортировке — как тай-брейк, иначе страницы «плавают» при равном created_at.
    limit/offset уже провалидированы вызывающим (_page_args) — тут только применяем."""
    if status != 'all':
        q = q.filter(Application.status == status)
    q = q.order_by(Application.created_at.desc(), Application.id.desc())
    payload = {}
    if limit is not None:
        payload['total'] = q.count()
        rows = q.offset(offset).limit(limit).all()
    else:
        rows = q.all()
    payload['applications'] = [serialize_application(a) for a in rows]
    return payload


# ── штаб организатора ──
@organizer_bp.route('/me/org/events', methods=['GET'])
@profiled_required
def org_events():
    """Мои сборы со сводкой ответов (форма buildOrgEvents).

    Опционально ?status=pending|live|soon|done|all и ?limit/&offset.
    Фильтр по ВЫЧИСЛЕННОМУ статусу (его считает сериализатор), поэтому режем
    список уже после сериализации — сборов у одного организатора немного.
    """
    status = _status_arg(('pending', 'live', 'soon', 'done', 'rejected', 'all'))
    if status is None:
        return jsonify({'error': 'Неизвестный статус'}), 400
    limit, offset = _page_args()          # валидируем пагинацию до раннего выхода
    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'events': []})
    rows = (Gathering.query.filter(Gathering.id.in_(ids))
            .order_by(Gathering.starts_at.asc()).all())
    pending = dict(
        db.session.query(Application.gathering_id, db.func.count(Application.id))
        .filter(Application.gathering_id.in_(ids), Application.status == 'pending')
        .group_by(Application.gathering_id).all()
    )
    today = _now().date()
    events = [serialize_org_event(x, pending.get(x.id, 0), today) for x in rows]
    if status != 'all':
        events = [e for e in events if e['status'] == status]
    payload = {'events': events}
    if limit is not None:
        payload['total'] = len(events)
        payload['events'] = events[offset:offset + limit]
    return jsonify(payload)


@organizer_bp.route('/me/org/applications', methods=['GET'])
@profiled_required
def my_applications():
    """Входящие заявки по всем моим сборам (форма buildApplications).
    Опционально ?status=pending|accepted|declined|all и ?limit/&offset."""
    status = _status_arg(APPLICATION_STATUSES + ('all',))
    if status is None:
        return jsonify({'error': 'Неизвестный статус'}), 400
    limit, offset = _page_args()          # валидируем пагинацию до раннего выхода
    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'applications': []})
    return jsonify(_applications_payload(
        Application.query.filter(Application.gathering_id.in_(ids)), status, limit, offset))


@organizer_bp.route('/me/org/volunteers', methods=['GET'])
@profiled_required
def org_volunteers():
    """База волонтёров моих сборов: пришедшие (presence='came') И записавшиеся (yes/maybe).
    Только 'came' давало пустой список, пока ни один сбор не финализирован."""
    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'volunteers': []})
    rows = (Participant.query.filter(
        Participant.gathering_id.in_(ids),
        Participant.user_id.isnot(None),
        db.or_(Participant.presence == 'came', Participant.answer.in_(('yes', 'maybe')))).all())

    # агрегируем по волонтёру, запоминая последний (по времени) сбор
    by_user = {}
    for p in rows:
        cur = by_user.get(p.user_id)
        key = p.checked_in_at or p.updated_at
        if cur is None or (key is not None and (cur[1] is None or key > cur[1])):
            by_user[p.user_id] = (p.gathering_id, key)

    out = []
    for uid, (gid, _ts) in by_user.items():
        u = db.session.get(User, uid)
        if u is None or not u.is_active:
            continue
        last_g = db.session.get(Gathering, gid)
        out.append(serialize_org_volunteer(u, last_g))
    out.sort(key=lambda v: v['reliability'], reverse=True)
    return jsonify({'volunteers': out})


# ── аналитика штаба ──
class _AtRsvpPart:
    """Участник «как на момент RSVP»: .answer + .history из snapshot-полей.

    Нужен, чтобы MAE считался против прогноза, который БЫЛ бы до сбора. Живой
    Participant.history берёт свежий User.trust_*, уже обученный этим же сбором —
    по нему «прогноз» подглядывал бы в ответ.
    """
    __slots__ = ('answer', 'history')

    def __init__(self, p):
        self.answer = p.answer
        self.history = {'total': p.hist_total_at_rsvp or 0, 'came': p.hist_came_at_rsvp or 0}


def _forecast_mae(done_rows):
    """Средняя абсолютная ошибка прогноза по завершённым сборам → {mae, n} или None."""
    from models import ForecastParams
    from services.forecast import compute_forecast

    params = ForecastParams.get()
    errors = []
    for x in done_rows:
        parts = [p for p in x.participants if p.answer in ANSWERS]
        if not parts:
            continue                      # без ответов прогноза не было — не штрафуем модель
        expected = compute_forecast([_AtRsvpPart(p) for p in parts], x.ctx or 1.0, params)['E']
        came = sum(1 for p in x.participants if p.presence == 'came')
        errors.append(abs(expected - came))
    if not errors:
        return None
    return {'mae': round(sum(errors) / len(errors), 2), 'n': len(errors)}


def _empty_analytics():
    return {'activeGatherings': 0, 'confirmedTotal': 0, 'attendancePct': 0, 'hoursTotal': 0,
            'forecastAccuracy': None, 'byMonth': [], 'topVolunteers': []}


@organizer_bp.route('/me/org/analytics', methods=['GET'])
@profiled_required
def org_analytics():
    """Сводка штаба по РЕАЛЬНЫМ данным.

    Часы — сумма AttendanceRecord.hours_credited по моим сборам (фронт до этого
    показывал came × 4, то есть выдуманное число).
    """
    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'analytics': _empty_analytics()})

    rows = Gathering.query.filter(Gathering.id.in_(ids)).all()
    today = _now().date()
    done_ids = {x.id for x in rows if _is_done(x, today)}
    done_rows = [x for x in rows if x.id in done_ids]
    active_rows = [x for x in rows if x.id not in done_ids]

    confirmed = sum(1 for x in active_rows for p in x.participants if p.answer == 'yes')
    answered = sum(1 for x in done_rows for p in x.participants if p.answer in ANSWERS)
    came_done = sum(1 for x in done_rows for p in x.participants if p.presence == 'came')

    # журнал явки — единственный источник часов (и приходов для топа/помесячной сводки)
    recs = (db.session.query(AttendanceRecord.gathering_id, AttendanceRecord.user_id,
                             AttendanceRecord.presence, AttendanceRecord.hours_credited)
            .filter(AttendanceRecord.gathering_id.in_(ids)).all())
    hours_total = 0
    hours_by_gathering = {}
    came_by_gathering = {}
    for r in recs:
        h = r.hours_credited or 0
        hours_total += h
        hours_by_gathering[r.gathering_id] = hours_by_gathering.get(r.gathering_id, 0) + h
        if r.presence == 'came':
            came_by_gathering[r.gathering_id] = came_by_gathering.get(r.gathering_id, 0) + 1

    # по месяцам проведения (последние 12, по возрастанию).
    # Баг 4: came берём из журнала явки — тем же источником, что и hours. Гостевой
    # приход (Participant без user_id) часов не даёт и AttendanceRecord не порождает,
    # поэтому в came его больше не считаем — иначе строка врала «1 волонтёр, 0 ч».
    months = {}
    for x in rows:
        if x.starts_at is None:
            continue
        key = x.starts_at.strftime('%Y-%m')
        b = months.setdefault(key, {'month': key, 'gatherings': 0, 'came': 0, 'hours': 0})
        b['gatherings'] += 1
        b['came'] += came_by_gathering.get(x.id, 0)
        b['hours'] += hours_by_gathering.get(x.id, 0)
    by_month = [months[k] for k in sorted(months)][-12:]

    # топ волонтёров: кто чаще приходил именно ко мне
    per_user = {}
    for r in recs:
        if r.user_id is None:
            continue
        b = per_user.setdefault(r.user_id, {'id': r.user_id, 'name': None, 'came': 0, 'hours': 0})
        if r.presence == 'came':
            b['came'] += 1
        b['hours'] += (r.hours_credited or 0)
    top = [v for v in per_user.values() if v['came'] > 0]
    top.sort(key=lambda v: (v['came'], v['hours']), reverse=True)
    top = top[:10]
    for v in top:
        u = db.session.get(User, v['id'])
        v['name'] = u.full_name if u else None

    return jsonify({'analytics': {
        'activeGatherings': len(active_rows),
        'confirmedTotal': confirmed,
        'attendancePct': round(100 * came_done / answered) if answered else 0,
        'hoursTotal': hours_total,
        'forecastAccuracy': _forecast_mae(done_rows),
        'byMonth': by_month,
        'topVolunteers': top,
    }})


# ── рассылка по своей базе волонтёров ──
@organizer_bp.route('/me/org/broadcast', methods=['POST'])
@rate_limit(5, 3600, by_user=True)
@profiled_required
def org_broadcast():
    """Объявление своей базе: тем, кто уже приходил на мои сборы (presence='came').

    /api/admin/broadcast — только админу, /gatherings/<id>/remind — только по ростеру
    одного сбора; организатору написать своим было нечем.
    """
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    body_ru = (data.get('textRu') or data.get('text_ru') or '').strip()
    body_kz = (data.get('textKz') or data.get('text_kz') or body_ru).strip()

    def compose(t, b):
        s = (f'{t}. {b}' if (t and b) else (t or b)).strip()
        return s[:300] if s else None

    text_ru = compose(title, body_ru)
    text_kz = compose(title, body_kz)
    if not text_ru:
        return jsonify({'error': 'Пустое объявление'}), 400

    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'sent': 0})
    user_ids = {r[0] for r in db.session.query(Participant.user_id).filter(
        Participant.gathering_id.in_(ids),
        Participant.user_id.isnot(None),
        Participant.presence == 'came').distinct().all()}
    user_ids.discard(g.user.id)          # себе объявление не шлём

    now = _now()
    sent = 0
    for uid in user_ids:
        u = db.session.get(User, uid)
        if u is None or not u.is_active:
            continue
        db.session.add(Notification(user_id=uid, type='system',
                                    text_ru=text_ru, text_kz=text_kz, created_at=now))
        sent += 1
    db.session.commit()
    return jsonify({'sent': sent})


# ── заявки ──
@organizer_bp.route('/events/<int:id>/applications', methods=['GET'])
@gathering_owner_required
def event_applications(id):
    """Заявки на один сбор (владелец/со-координатор). ?status=pending|accepted|declined|all.

    Тот же shape, что у /me/org/applications — фронту не нужно тянуть все заявки
    глобально и фильтровать у себя.
    """
    status = _status_arg(APPLICATION_STATUSES + ('all',))
    if status is None:
        return jsonify({'error': 'Неизвестный статус'}), 400
    limit, offset = _page_args()
    return jsonify(_applications_payload(
        Application.query.filter(Application.gathering_id == id), status, limit, offset))


@organizer_bp.route('/events/<int:id>/applications', methods=['POST'])
@profiled_required
def create_application(id):
    """Подать заявку на событие. Тело {skills, message}; PII сервер берёт из User."""
    gathering = db.session.get(Gathering, id)
    if gathering is None or gathering.status == 'deleted':
        return jsonify({'error': 'Событие не найдено'}), 404
    # На свой сбор заявку не подают: иначе организатор сам себе участник + уведомление.
    if _owns_gathering(g.user, gathering):
        return jsonify({'error': 'Нельзя подать заявку на свой сбор'}), 400
    # Баг 2.5: на завершённый/отклонённый сбор новую заявку не принимаем — иначе при
    # accept волонтёр попадёт в закрытое событие задним числом (искажает ростер/аналитику).
    if gathering.status in _CLOSED_STATUSES:
        return _closed_response()

    data = request.get_json(silent=True) or {}
    raw_skills = data.get('skills') if isinstance(data.get('skills'), list) else []
    skills = [s for s in raw_skills if s in APPLICATION_SKILLS]
    message = (data.get('message') or '').strip() or None
    user = g.user

    # уже подавал? — идемпотентно обновляем (без дублей: unique(gathering, applicant))
    existing = Application.query.filter_by(gathering_id=id, applicant_id=user.id).first()
    if existing is not None:
        existing.skills = skills
        existing.message = message
        if existing.status == 'declined':
            existing.status = 'pending'
        db.session.commit()
        return jsonify({'application': serialize_application(existing)}), 200

    application = Application(
        gathering_id=id, applicant_id=user.id, org_id=gathering.org_id,
        skills=skills, message=message, status='pending',
        name=user.full_name or 'Волонтёр', phone=user.phone, city_id=user.city_id,
    )
    db.session.add(application)
    db.session.commit()
    return jsonify({'application': serialize_application(application)}), 201


def _decide_application(application, gathering, accepted):
    """Решение по заявке — общая часть одиночного и массового пути. БЕЗ commit
    (в bulk коммит один на всю пачку). → True, если что-то изменилось."""
    target = 'accepted' if accepted else 'declined'
    if application.status == target:
        return False
    # Баг 2.5: accept на завершённом/отклонённом сборе добавил бы участника в закрытое
    # событие задним числом — блокируем. Decline остаётся возможным (чистка ростера).
    # Проверяем ДО мутации статуса, чтобы при отказе ничего не менялось.
    if accepted and gathering.status in _CLOSED_STATUSES:
        raise _GatheringClosed()
    was_accepted = application.status == 'accepted'   # под accept уже есть Participant
    application.status = target
    application.decided_at = _now()
    if accepted:
        # заявка → участник (не переопределяем существующего)
        existing = Participant.query.filter_by(
            gathering_id=gathering.id, user_id=application.applicant_id).first()
        if existing is None:
            applicant = db.session.get(User, application.applicant_id)
            db.session.add(Participant(
                gathering_id=gathering.id, user_id=application.applicant_id,
                name=application.name or (applicant.full_name if applicant else 'Волонтёр'),
                phone=application.phone or (applicant.phone if applicant else None),
                answer='yes', answered_at=_now(),
                hist_total_at_rsvp=(applicant.trust_total or 0) if applicant else 0,
                hist_came_at_rsvp=(applicant.trust_came or 0) if applicant else 0,
            ))
        else:
            existing.answer = 'yes'
        gathering.bump()
    elif was_accepted:
        # Баг 2.3: decline РАНЕЕ ПРИНЯТОЙ заявки оставлял фантомного участника
        # ('yes') в ростере — counts/forecast/revision продолжали врать. Убираем
        # его. Чистим ТОЛЬКО когда заявка была accepted (под неё создан Participant);
        # decline pending-заявки участника не порождал — там ничего не трогаем.
        part = Participant.query.filter_by(
            gathering_id=gathering.id, user_id=application.applicant_id).first()
        if part is not None:
            # Нет отметок явки → участник создан ровно из этой заявки: удаляем
            # начисто. Чище, чем answer='no' — не раздуваем counts.total и число
            # «ответивших», прогноз перестаёт его учитывать вовсе. Если явка уже
            # проставлена (came/missed) — не теряем её, лишь снимаем из «да».
            if part.presence is None and part.checked_in_at is None:
                db.session.delete(part)
            else:
                part.answer = 'no'
            gathering.bump()
    from services.notifications import notify_application_decision
    notify_application_decision(application, accepted=accepted)
    return True


@organizer_bp.route('/applications/<int:aid>/accept', methods=['POST'])
@profiled_required
def accept_application(aid):
    """Принять заявку: status=accepted + создать Participant('yes'), bump revision."""
    application = db.session.get(Application, aid)
    if application is None:
        return jsonify({'error': 'Заявка не найдена'}), 404
    gathering = db.session.get(Gathering, application.gathering_id)
    if not _owns_gathering(g.user, gathering):
        return jsonify({'error': 'Это не ваш сбор'}), 403

    if _decide_application(application, gathering, accepted=True):
        db.session.commit()
    return jsonify({'application': serialize_application(application)})


@organizer_bp.route('/applications/<int:aid>/decline', methods=['POST'])
@profiled_required
def decline_application(aid):
    """Отклонить заявку: status=declined (участника не создаём)."""
    application = db.session.get(Application, aid)
    if application is None:
        return jsonify({'error': 'Заявка не найдена'}), 404
    gathering = db.session.get(Gathering, application.gathering_id)
    if not _owns_gathering(g.user, gathering):
        return jsonify({'error': 'Это не ваш сбор'}), 403

    if _decide_application(application, gathering, accepted=False):
        db.session.commit()
    return jsonify({'application': serialize_application(application)})


@organizer_bp.route('/applications/bulk', methods=['POST'])
@profiled_required
def bulk_applications():
    """Массовое решение: {ids:[int], action:'accept'|'decline'}.

    Частично-успешный ответ: {updated:[id], failed:[{id, error}]} — одна чужая или
    удалённая заявка не должна ронять всю пачку.
    """
    data = request.get_json(silent=True) or {}
    action = (data.get('action') or '').strip()
    ids = data.get('ids')
    if action not in ('accept', 'decline'):
        return jsonify({'error': 'Действие должно быть accept или decline'}), 400
    if not isinstance(ids, list) or not ids:
        return jsonify({'error': 'Нужен непустой список ids'}), 400
    if len(ids) > 200:
        return jsonify({'error': 'Не больше 200 заявок за раз'}), 400
    if any(not isinstance(i, int) or isinstance(i, bool) for i in ids):
        return jsonify({'error': 'ids должен быть списком целых чисел'}), 400

    accepted = action == 'accept'
    updated, failed, seen = [], [], set()
    for aid in ids:
        if aid in seen:                  # дубли в теле — не повод дважды слать уведомление
            continue
        seen.add(aid)
        application = db.session.get(Application, aid)
        if application is None:
            failed.append({'id': aid, 'error': 'Заявка не найдена'})
            continue
        gathering = db.session.get(Gathering, application.gathering_id)
        if not _owns_gathering(g.user, gathering):
            failed.append({'id': aid, 'error': 'Это не ваш сбор'})
            continue
        try:
            _decide_application(application, gathering, accepted=accepted)
        except _GatheringClosed:         # accept на завершённом/отклонённом — в failed, не роняем пачку
            failed.append({'id': aid, 'error': 'Сбор завершён'})
            continue
        updated.append(aid)              # уже в нужном статусе → тоже успех (идемпотентно)
    db.session.commit()
    return jsonify({'updated': updated, 'failed': failed})
