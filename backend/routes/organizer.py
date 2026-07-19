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
    Application, APPLICATION_SKILLS,
)
from utils.decorators import profiled_required
from utils.serializers import (
    serialize_org_event, serialize_application, serialize_org_volunteer,
)

organizer_bp = Blueprint('organizer', __name__)


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


# ── штаб организатора ──
@organizer_bp.route('/me/org/events', methods=['GET'])
@profiled_required
def org_events():
    """Мои сборы со сводкой ответов (форма buildOrgEvents)."""
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
    return jsonify({'events': [serialize_org_event(x, pending.get(x.id, 0), today) for x in rows]})


@organizer_bp.route('/me/org/applications', methods=['GET'])
@profiled_required
def my_applications():
    """Входящие заявки по всем моим сборам (форма buildApplications)."""
    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'applications': []})
    rows = (Application.query.filter(Application.gathering_id.in_(ids))
            .order_by(Application.created_at.desc()).all())
    return jsonify({'applications': [serialize_application(a) for a in rows]})


@organizer_bp.route('/me/org/volunteers', methods=['GET'])
@profiled_required
def org_volunteers():
    """База волонтёров: те, кто приходил (presence='came') на мои прошлые сборы."""
    ids = _my_gathering_ids(g.user)
    if not ids:
        return jsonify({'volunteers': []})
    rows = (Participant.query.filter(
        Participant.gathering_id.in_(ids),
        Participant.user_id.isnot(None),
        Participant.presence == 'came').all())

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


# ── заявки ──
@organizer_bp.route('/events/<int:id>/applications', methods=['POST'])
@profiled_required
def create_application(id):
    """Подать заявку на событие. Тело {skills, message}; PII сервер берёт из User."""
    gathering = db.session.get(Gathering, id)
    if gathering is None or gathering.status == 'deleted':
        return jsonify({'error': 'Событие не найдено'}), 404

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

    if application.status != 'accepted':
        application.status = 'accepted'
        application.decided_at = _now()
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
        from services.notifications import notify_application_decision
        notify_application_decision(application, accepted=True)
        gathering.bump()
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

    if application.status != 'declined':
        application.status = 'declined'
        application.decided_at = _now()
        from services.notifications import notify_application_decision
        notify_application_decision(application, accepted=False)
        db.session.commit()
    return jsonify({'application': serialize_application(application)})
