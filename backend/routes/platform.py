"""P2a: соц-платформа — каталог (города/темы/бейджи), лента событий, НКО,
благотворительность, рейтинг, подписки. Читаемое — публично; мутации — под сессией.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required

from models import (
    db, User, Theme, City, Badge, Gathering, Participant,
    Org, CharityRequest, Donation, Follow, ANSWERS,
)
from services.identity import current_user
from utils.decorators import profiled_required
from utils.serializers import (
    serialize_event_card, serialize_org, serialize_charity, serialize_volunteer,
    serialize_user_public, serialize_city_stats, serialize_participant,
)

platform_bp = Blueprint('platform', __name__)


# ── каталог / bootstrap ──
@platform_bp.route('/cities', methods=['GET'])
def cities():
    rows = City.query.all()
    return jsonify({'cities': [serialize_city_stats(c) for c in rows]})


@platform_bp.route('/themes', methods=['GET'])
def themes():
    return jsonify({'themes': [t.to_dict() for t in Theme.query.all()]})


@platform_bp.route('/badges', methods=['GET'])
def badges():
    return jsonify({'badges': [b.to_dict() for b in Badge.query.all()]})


@platform_bp.route('/users/<int:uid>', methods=['GET'])
def user_public(uid):
    u = db.session.get(User, uid)
    if u is None or not u.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    return jsonify({'user': serialize_user_public(u)})


# ── лента событий (открытые сборы) ──
def _feed_query():
    q = Gathering.query.filter(Gathering.status == 'open')
    theme = request.args.get('theme')
    city = request.args.get('city')
    fmt = request.args.get('format')
    if theme and theme != 'all':
        q = q.filter(Gathering.theme == theme)
    if city and city != 'all':
        q = q.filter(Gathering.city_id == city)
    if fmt and fmt != 'all':
        q = q.filter(Gathering.format == fmt)
    return q.order_by(Gathering.starts_at.asc())


@platform_bp.route('/events', methods=['GET'])
@jwt_required(optional=True)
def events():
    u = current_user()
    viewer = u.id if u else None
    rows = _feed_query().all()
    return jsonify({'events': [serialize_event_card(g, viewer) for g in rows]})


@platform_bp.route('/events/<int:id>', methods=['GET'])
@jwt_required(optional=True)
def event_detail(id):
    g_ = db.session.get(Gathering, id)
    if g_ is None or g_.status == 'deleted':
        return jsonify({'error': 'Событие не найдено'}), 404
    u = current_user()
    return jsonify({'event': serialize_event_card(g_, u.id if u else None)})


@platform_bp.route('/events/<int:id>/participants', methods=['GET'])
def event_participants(id):
    g_ = db.session.get(Gathering, id)
    if g_ is None:
        return jsonify({'error': 'Событие не найдено'}), 404
    limit = min(int(request.args.get('limit', 7)), 30)
    yes = [p for p in g_.participants if p.answer == 'yes'][:limit]
    # публично: только имя/инициалы, без PII
    return jsonify({'participants': [{'id': p.id, 'name': p.name} for p in yes]})


@platform_bp.route('/events/<int:id>/registration', methods=['GET'])
@jwt_required()
def get_registration(id):
    u = current_user()
    p = Participant.query.filter_by(gathering_id=id, user_id=u.id).first() if u else None
    return jsonify({'answer': p.answer if p else None})


@platform_bp.route('/events/<int:id>/registration', methods=['PUT'])
@jwt_required()
def set_registration(id):
    u = current_user()
    if u is None:
        return jsonify({'error': 'Пользователь не найден'}), 404
    g_ = db.session.get(Gathering, id)
    if g_ is None or g_.status != 'open':
        return jsonify({'error': 'Событие не найдено'}), 404
    data = request.get_json(silent=True) or {}
    answer = data.get('answer')
    if answer not in ANSWERS:
        return jsonify({'error': 'answer ∈ yes|maybe|no'}), 400

    now = datetime.now(timezone.utc)
    p = Participant.query.filter_by(gathering_id=id, user_id=u.id).first()
    if p is None:
        p = Participant(gathering_id=id, user_id=u.id, name=u.full_name or 'Гость',
                        phone=u.phone, hist_total_at_rsvp=u.trust_total or 0,
                        hist_came_at_rsvp=u.trust_came or 0, answered_at=now)
        db.session.add(p)
    p.answer = answer
    p.answered_at = now
    g_.bump()
    db.session.commit()
    going = g_.going_cache if g_.going_cache is not None else sum(1 for x in g_.participants if x.answer == 'yes')
    return jsonify({'answer': answer, 'going': going})


@platform_bp.route('/me/registrations', methods=['GET'])
@profiled_required
def my_registrations():
    rows = Participant.query.filter_by(user_id=g.user.id).all()
    return jsonify({'registrations': {str(p.gathering_id): p.answer for p in rows if p.answer}})


# ── НКО ──
@platform_bp.route('/orgs/<int:id>', methods=['GET'])
@jwt_required(optional=True)
def org_detail(id):
    org = db.session.get(Org, id)
    if org is None:
        return jsonify({'error': 'Организация не найдена'}), 404
    u = current_user()
    following = None
    if u:
        following = db.session.query(Follow.id).filter_by(user_id=u.id, org_id=org.id).first() is not None
    return jsonify({'org': serialize_org(org, following=following)})


@platform_bp.route('/orgs/<int:id>/events', methods=['GET'])
@jwt_required(optional=True)
def org_events(id):
    u = current_user()
    rows = Gathering.query.filter(Gathering.org_id == id, Gathering.status != 'deleted').order_by(
        Gathering.starts_at.asc()).all()
    return jsonify({'events': [serialize_event_card(x, u.id if u else None) for x in rows]})


@platform_bp.route('/orgs', methods=['GET'])
def orgs_list():
    return jsonify({'orgs': [serialize_org(o) for o in Org.query.all()]})


@platform_bp.route('/orgs/<int:id>/follow', methods=['POST'])
@profiled_required
def follow_org(id):
    if db.session.get(Org, id) is None:
        return jsonify({'error': 'Организация не найдена'}), 404
    if db.session.query(Follow.id).filter_by(user_id=g.user.id, org_id=id).first() is None:
        db.session.add(Follow(user_id=g.user.id, org_id=id))
        db.session.commit()
    return jsonify({'following': True})


@platform_bp.route('/orgs/<int:id>/follow', methods=['DELETE'])
@profiled_required
def unfollow_org(id):
    Follow.query.filter_by(user_id=g.user.id, org_id=id).delete()
    db.session.commit()
    return '', 204


@platform_bp.route('/me/follows', methods=['GET'])
@profiled_required
def my_follows():
    rows = Follow.query.filter_by(user_id=g.user.id).all()
    return jsonify({'follows': [f.org_id for f in rows]})


# ── благотворительность ──
@platform_bp.route('/charity', methods=['GET'])
def charity_list():
    q = CharityRequest.query
    city = request.args.get('city')
    kind = request.args.get('kind')
    if city and city != 'all':
        q = q.filter(CharityRequest.city_id == city)
    if kind and kind != 'all':
        q = q.filter(CharityRequest.kind == kind)
    return jsonify({'charity': [serialize_charity(c) for c in q.all()]})


@platform_bp.route('/charity/<int:id>', methods=['GET'])
def charity_detail(id):
    c = db.session.get(CharityRequest, id)
    if c is None:
        return jsonify({'error': 'Сбор не найден'}), 404
    return jsonify({'charity': serialize_charity(c)})


@platform_bp.route('/charity/<int:id>/donate', methods=['POST'])
@profiled_required
def donate(id):
    c = db.session.get(CharityRequest, id)
    if c is None:
        return jsonify({'error': 'Сбор не найден'}), 404
    data = request.get_json(silent=True) or {}
    if c.kind == 'money':
        amt = int(data.get('amount', 0) or 0)
    else:
        amt = int(data.get('quantity', data.get('amount', 1)) or 1)
    if amt <= 0:
        return jsonify({'error': 'Некорректная сумма'}), 400
    c.raised = min(c.goal, (c.raised or 0) + amt)
    d = Donation(charity_id=c.id, user_id=g.user.id, amount=amt)
    db.session.add(d)
    db.session.commit()
    return jsonify({'raised': c.raised, 'donationId': d.id})


# ── рейтинг ──
@platform_bp.route('/leaderboard/volunteers', methods=['GET'])
def leaderboard_volunteers():
    q = User.query.filter(User.is_active.is_(True), User.hours_total > 0)
    city = request.args.get('city')
    if city and city != 'all':
        q = q.filter(User.city_id == city)
    rows = q.order_by(User.hours_total.desc()).limit(50).all()
    return jsonify({'volunteers': [serialize_volunteer(u) for u in rows]})


@platform_bp.route('/leaderboard/cities', methods=['GET'])
def leaderboard_cities():
    rows = City.query.all()
    data = [serialize_city_stats(c) for c in rows]
    data.sort(key=lambda x: x['vol'], reverse=True)
    return jsonify({'cities': data})


@platform_bp.route('/leaderboard/orgs', methods=['GET'])
def leaderboard_orgs():
    data = [serialize_org(o) for o in Org.query.all()]
    data.sort(key=lambda x: x['vol'], reverse=True)
    return jsonify({'orgs': data})
