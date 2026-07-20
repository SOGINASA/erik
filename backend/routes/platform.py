"""P2a: соц-платформа — каталог (города/темы/бейджи), лента событий, НКО,
благотворительность, рейтинг, подписки. Читаемое — публично; мутации — под сессией.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required

from models import (
    db, User, Theme, City, Badge, Gathering, Participant,
    Org, CharityRequest, Donation, Follow, ANSWERS,
    Conversation, ConversationMember, Message, Report,
)
from services.identity import current_user
from utils.decorators import profiled_required, rate_limit
from utils.serializers import (
    serialize_event_card, serialize_org, serialize_charity, serialize_volunteer,
    serialize_user_public, serialize_city_stats, serialize_participant,
    serialize_conversation,
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


@platform_bp.route('/users/me', methods=['GET'])
@jwt_required()
def user_me():
    u = current_user()
    if u is None or not u.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    return jsonify({'user': serialize_user_public(u)})


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
    q = _feed_query()
    # опциональная пагинация (limit/offset) — по умолчанию отдаём всё (совместимость)
    try:
        limit = int(request.args.get('limit')) if request.args.get('limit') else None
    except (TypeError, ValueError):
        limit = None
    total = None
    if limit is not None:
        limit = max(1, min(200, limit))
        try:
            offset = max(0, int(request.args.get('offset', 0)))
        except (TypeError, ValueError):
            offset = 0
        total = q.count()
        rows = q.offset(offset).limit(limit).all()
    else:
        rows = q.all()
    payload = {'events': [serialize_event_card(g, viewer) for g in rows]}
    if total is not None:
        payload['total'] = total
    return jsonify(payload)


@platform_bp.route('/events/<int:id>', methods=['GET'])
@jwt_required(optional=True)
def event_detail(id):
    g_ = db.session.get(Gathering, id)
    if g_ is None or g_.status == 'deleted':
        return jsonify({'error': 'Событие не найдено'}), 404
    u = current_user()
    # сбор на модерации виден по прямой ссылке только его владельцу
    if g_.status == 'pending' and (u is None or u.id != g_.owner_id):
        return jsonify({'error': 'Событие не найдено'}), 404
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
    prev_answer = p.answer if p else None
    if p is None:
        p = Participant(gathering_id=id, user_id=u.id, name=u.full_name or 'Гость',
                        phone=u.phone, hist_total_at_rsvp=u.trust_total or 0,
                        hist_came_at_rsvp=u.trust_came or 0, answered_at=now)
        db.session.add(p)
    p.answer = answer
    p.answered_at = now
    if answer != prev_answer and u.id != g_.owner_id:
        from services.notifications import notify_owner_answer
        notify_owner_answer(g_, u.full_name or 'Участник', answer)
    g_.bump()
    db.session.commit()
    going = g_.going_cache if g_.going_cache is not None else sum(1 for x in g_.participants if x.answer == 'yes')
    return jsonify({'answer': answer, 'going': going})


@platform_bp.route('/events/<int:id>/registration', methods=['DELETE'])
@profiled_required
def delete_registration(id):
    """Отозвать запись на событие ленты (удалить свой Participant)."""
    p = Participant.query.filter_by(gathering_id=id, user_id=g.user.id).first()
    if p is not None:
        db.session.delete(p)
        g_ = db.session.get(Gathering, id)
        if g_ is not None:
            g_.bump()
        db.session.commit()
    return '', 204


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
    rows = Gathering.query.filter(
        Gathering.org_id == id, Gathering.status.notin_(('deleted', 'pending'))).order_by(
        Gathering.starts_at.asc()).all()
    return jsonify({'events': [serialize_event_card(x, u.id if u else None) for x in rows]})


@platform_bp.route('/orgs', methods=['GET'])
def orgs_list():
    return jsonify({'orgs': [serialize_org(o) for o in Org.query.all()]})


@platform_bp.route('/orgs', methods=['POST'])
@profiled_required
def create_org():
    """Заявка на создание НКО (self-registration). verified=False → в очередь модерации."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Название организации обязательно'}), 400
    org = Org(
        name=name,
        cat=data.get('cat') or None,
        city_id=data.get('cityId') or data.get('city_id') or g.user.city_id,
        verified=False,
        about_ru=(data.get('aboutRu') or '').strip() or None,
        about_kz=(data.get('aboutKz') or '').strip() or None,
        owner_id=g.user.id,
    )
    if g.user.role != 'org':
        g.user.role = 'org'
    db.session.add(org)
    db.session.commit()
    return jsonify({'org': serialize_org(org)}), 201


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
@rate_limit(20, 60)
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


# ── жалобы (пользовательская модерация) ──
REPORT_TARGETS = ('event', 'profile', 'message', 'org')


@platform_bp.route('/reports', methods=['POST'])
@profiled_required
def create_report():
    """Подать жалобу. Тело {targetType, targetId, reason}. Агрегируем по цели (count++)."""
    data = request.get_json(silent=True) or {}
    target_type = (data.get('targetType') or data.get('target_type') or '').strip()
    if target_type not in REPORT_TARGETS:
        return jsonify({'error': 'Некорректный тип цели'}), 400
    try:
        target_id = int(data.get('targetId') or data.get('target_id'))
    except (TypeError, ValueError):
        target_id = None
    reason = (data.get('reason') or data.get('text') or '').strip()
    if not reason:
        return jsonify({'error': 'Опишите причину'}), 400

    existing = (Report.query
                .filter_by(target_type=target_type, target_id=target_id)
                .filter(Report.status.in_(('open', 'reviewing'))).first())
    if existing is not None:
        existing.count = (existing.count or 1) + 1
        existing.reporter_id = g.user.id
        db.session.commit()
        return jsonify({'report': existing.to_dict()}), 200

    r = Report(target_type=target_type, target_id=target_id, reason=reason,
               text_ru=reason, text_kz=reason, count=1, status='open', reporter_id=g.user.id)
    db.session.add(r)
    db.session.commit()
    return jsonify({'report': r.to_dict()}), 201


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


# ── сообщения ──
def _my_convo(cid):
    """Диалог, если текущий пользователь — его участник; иначе None."""
    u = current_user()
    if u is None:
        return None, None
    member = ConversationMember.query.filter_by(conversation_id=cid, user_id=u.id).first()
    if member is None:
        return u, None
    return u, db.session.get(Conversation, cid)


@platform_bp.route('/conversations', methods=['GET'])
@profiled_required
def conversations():
    ids = [m.conversation_id for m in ConversationMember.query.filter_by(user_id=g.user.id).all()]
    rows = (Conversation.query.filter(Conversation.id.in_(ids)).all() if ids else [])
    rows.sort(key=lambda c: (c.messages[-1].created_at if c.messages else c.created_at), reverse=True)
    return jsonify({'conversations': [serialize_conversation(c, g.user.id) for c in rows]})


@platform_bp.route('/conversations', methods=['POST'])
@profiled_required
def create_conversation():
    """Начать (или найти) 1-на-1 диалог с пользователем. Тело: {peerUserId}.
    Идемпотентно: если приватный диалог с этим пользователем уже есть — вернуть его."""
    data = request.get_json(silent=True) or {}
    raw = data.get('peerUserId') or data.get('peer_id')
    try:
        peer_id = int(raw)
    except (TypeError, ValueError):
        return jsonify({'error': 'peerUserId обязателен'}), 400
    if peer_id == g.user.id:
        return jsonify({'error': 'Нельзя написать самому себе'}), 400
    peer = db.session.get(User, peer_id)
    if peer is None or not peer.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404

    # уже есть приватный (ровно 2 участника) диалог с этим пользователем?
    mine = {m.conversation_id for m in ConversationMember.query.filter_by(user_id=g.user.id).all()}
    theirs = {m.conversation_id for m in ConversationMember.query.filter_by(user_id=peer_id).all()}
    for cid in (mine & theirs):
        convo = db.session.get(Conversation, cid)
        if convo and len(convo.members) == 2:
            return jsonify({'conversation': serialize_conversation(convo, g.user.id)}), 200

    role = 'coordinator' if g.user.role in ('coord', 'org') else 'nko'
    convo = Conversation(title=peer.full_name or 'Диалог', role=role)
    db.session.add(convo)
    db.session.flush()
    db.session.add(ConversationMember(conversation_id=convo.id, user_id=g.user.id))
    db.session.add(ConversationMember(conversation_id=convo.id, user_id=peer_id))
    db.session.commit()
    return jsonify({'conversation': serialize_conversation(convo, g.user.id)}), 201


@platform_bp.route('/conversations/<int:cid>', methods=['GET'])
@profiled_required
def conversation_detail(cid):
    _u, convo = _my_convo(cid)
    if convo is None:
        return jsonify({'error': 'Диалог не найден'}), 404
    return jsonify({'conversation': serialize_conversation(convo, g.user.id)})


@platform_bp.route('/conversations/<int:cid>/messages', methods=['POST'])
@profiled_required
def send_message(cid):
    _u, convo = _my_convo(cid)
    if convo is None:
        return jsonify({'error': 'Диалог не найден'}), 404
    text = (request.get_json(silent=True) or {}).get('text', '').strip()
    if not text:
        return jsonify({'error': 'Пустое сообщение'}), 400
    msg = Message(conversation_id=cid, sender_id=g.user.id, body=text)
    db.session.add(msg)
    db.session.flush()
    # отправитель прочитал свой диалог
    member = ConversationMember.query.filter_by(conversation_id=cid, user_id=g.user.id).first()
    if member:
        member.last_read_message_id = msg.id
    db.session.commit()
    return jsonify({'message': {'me': True, 'txt': msg.body,
                                'created_at': msg.created_at.isoformat().replace('+00:00', 'Z')}}), 201


@platform_bp.route('/conversations/<int:cid>/read', methods=['POST'])
@profiled_required
def read_conversation(cid):
    member = ConversationMember.query.filter_by(conversation_id=cid, user_id=g.user.id).first()
    if member is None:
        return jsonify({'error': 'Диалог не найден'}), 404
    convo = db.session.get(Conversation, cid)
    if convo and convo.messages:
        member.last_read_message_id = convo.messages[-1].id
        db.session.commit()
    return '', 204


@platform_bp.route('/conversations/unread-count', methods=['GET'])
@profiled_required
def conversations_unread():
    ids = [m.conversation_id for m in ConversationMember.query.filter_by(user_id=g.user.id).all()]
    count = 0
    for m in ConversationMember.query.filter_by(user_id=g.user.id).all():
        convo = db.session.get(Conversation, m.conversation_id)
        if not convo:
            continue
        last = convo.messages[-1] if convo.messages else None
        if last and last.sender_id != g.user.id and (m.last_read_message_id or 0) < last.id:
            count += 1
    return jsonify({'count': count})
