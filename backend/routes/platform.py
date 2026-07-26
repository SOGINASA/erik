"""P2a: соц-платформа — каталог (города/темы/бейджи), лента событий, НКО,
благотворительность, рейтинг, подписки. Читаемое — публично; мутации — под сессией.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required

from models import (
    db, User, Theme, City, Badge, Gathering, GatheringCoordinator, Participant,
    Org, CharityRequest, Donation, Follow, ANSWERS, ORGANIZER_ROLES, RoleRequest,
    Conversation, ConversationMember, Message, Report,
)
from services.identity import current_user
from utils.decorators import profiled_required, rate_limit
from services.roles import sync_participant_role
from utils.serializers import (
    serialize_event_card, serialize_org, serialize_charity, serialize_volunteer,
    serialize_user_public, serialize_city_stats, serialize_participant,
    serialize_conversation, serialize_roles, serialize_role_request,
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


@platform_bp.route('/users/search', methods=['GET'])
@profiled_required
def users_search():
    """Поиск пользователя для личных сообщений: ?q=<телефон или имя>.
    Телефон матчим по цифрам (игнорируя пробелы/+/-); короткий текст — по имени.
    (Роут '/users/search' не конфликтует с '/users/<int:uid>' — 'search' не число.)"""
    from utils.serializers import serialize_message_target
    raw = (request.args.get('q') or request.args.get('phone') or '').strip()
    digits = ''.join(ch for ch in raw if ch.isdigit())
    if len(digits) < 3 and len(raw) < 2:
        return jsonify({'users': []})   # слишком короткий запрос — не отдаём всех
    q = User.query.filter(User.is_active.is_(True), User.id != g.user.id)
    if len(digits) >= 3:
        # нормализуем хранимый телефон до цифр и ищем вхождение введённых цифр
        norm = db.func.replace(db.func.replace(db.func.replace(
            db.func.coalesce(User.phone, ''), ' ', ''), '+', ''), '-', '')
        # КЗ/РФ часто набирают 8XXX вместо 7XXX — матчим оба варианта
        alt = ('7' + digits[1:]) if (len(digits) == 11 and digits[0] == '8') else digits
        cond = norm.like(f'%{digits}%')
        if alt != digits:
            cond = db.or_(cond, norm.like(f'%{alt}%'))
        q = q.filter(User.phone.isnot(None), cond)
    else:
        # SQLite lower() не трогает кириллицу — матчим и как введено, и с заглавной буквы
        cap = raw[:1].upper() + raw[1:]
        q = q.filter(db.or_(User.full_name.like(f'%{raw}%'), User.full_name.like(f'%{cap}%')))
    rows = q.order_by(User.full_name.asc()).limit(15).all()
    return jsonify({'users': [serialize_message_target(u) for u in rows]})


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


def _visible_gathering(gid, user):
    """Сбор, видимый читателю, иначе None: 'deleted' — никому, 'pending' (на модерации) —
    только владельцу по прямой ссылке. Одно правило на карточку и на ростер, чтобы
    видимость участников не разъезжалась с видимостью самого события."""
    g_ = db.session.get(Gathering, gid)
    if g_ is None or g_.status == 'deleted':
        return None
    if g_.status == 'pending' and (user is None or user.id != g_.owner_id):
        return None
    return g_


@platform_bp.route('/events/<int:id>', methods=['GET'])
@jwt_required(optional=True)
def event_detail(id):
    u = current_user()
    g_ = _visible_gathering(id, u)
    if g_ is None:
        return jsonify({'error': 'Событие не найдено'}), 404
    return jsonify({'event': serialize_event_card(g_, u.id if u else None)})


@platform_bp.route('/events/<int:id>/participants', methods=['GET'])
@jwt_required(optional=True)
def event_participants(id):
    # Ростер виден ровно там же, где само событие (_visible_gathering): раньше имена
    # утекали из 'deleted' и не прошедших модерацию 'pending' сборов по любому id.
    # Анонима не режем намеренно: лента и карточка события публичны, а отдаём только имя.
    u = current_user()
    g_ = _visible_gathering(id, u)
    if g_ is None:
        return jsonify({'error': 'Событие не найдено'}), 404
    try:
        limit = int(request.args.get('limit', 7))
    except (TypeError, ValueError):
        limit = 7
    limit = max(1, min(30, limit))
    yes = [p for p in g_.participants if p.answer == 'yes'][:limit]
    # публично: только имя/инициалы, без PII
    return jsonify({'participants': [{'id': p.id, 'name': p.name} for p in yes]})


# Ответы, при которых человек считается участником сбора. 'no' — это выход: он сказал,
# что не придёт, и ни в списке «кто идёт», ни в праве этот список смотреть его быть не должно.
COMING_ANSWERS = ('yes', 'maybe')


@platform_bp.route('/events/<int:id>/co-participants', methods=['GET'])
@profiled_required
def event_co_participants(id):
    """Кто ещё идёт на ЭТОТ сбор — волонтёру, который сам на него записан.

    Отдельный роут, а не расширение /participants: тот отдаёт публичную стопку аватаров
    (имя — и всё), а здесь нужен userId, чтобы строка вела в профиль (/u/:id). Публичным
    такой список делать нельзя: «кто с кем куда ходит» — это социальный граф, и раздавать
    его любому, кто знает номер сбора, значит раздавать связи людей всем подряд. Поэтому
    вход по ЧЛЕНСТВУ: список виден тому, кто сам в ростере, и тем, кто сбор ведёт
    (владелец/со-координатор — у них и так есть полный ростер с телефонами).

    PII здесь нет намеренно: телефон остаётся привилегией координатора
    (serialize_participant(coordinator=True)), наружу уходит ровно то, что и так открыто
    в публичном профиле /users/<id>.

    Walk-in гостей (user_id NULL) отдаём с userId=None: на сборе они реально будут, но
    аккаунта у них нет — фронт просто не рисует ссылку (та же идиома, что в ростере).
    """
    g_ = _visible_gathering(id, g.user)
    if g_ is None:
        return jsonify({'error': 'Событие не найдено'}), 404

    me = next((p for p in g_.participants if p.user_id == g.user.id), None)
    leads = g_.owner_id == g.user.id or db.session.query(GatheringCoordinator.id).filter_by(
        gathering_id=g_.id, user_id=g.user.id).first() is not None
    if not leads and (me is None or me.answer not in COMING_ANSWERS):
        return jsonify({'error': 'Список участников виден только записавшимся на сбор',
                        'errorKz': 'Қатысушылар тізімін тек жазылғандар көреді'}), 403

    roles_by_id = {r.id: r for r in g_.roles}
    out = []
    for p in g_.participants:
        if p.answer not in COMING_ANSWERS:
            continue
        # Роль резолвим ПО СЛОВАРЮ, а не через p.role: осиротевший role_id физически
        # возможен (см. models.Participant.role_id) и не должен ронять список.
        role = roles_by_id.get(p.role_id) if p.role_id else None
        out.append({
            'id': p.id,
            'userId': p.user_id,
            'name': p.name,
            'answer': p.answer,
            'isMe': me is not None and p.id == me.id,
            'roleId': role.id if role is not None else None,
            'roleTitleRu': role.title_ru if role is not None else None,
            'roleTitleKz': role.title_kz if role is not None else None,
        })
    # Сначала «приду», потом «возможно»; внутри — по имени. Список читают глазами,
    # а порядок вставки в ростер («кто раньше ответил») для этого ничего не значит.
    out.sort(key=lambda x: (0 if x['answer'] == 'yes' else 1, (x['name'] or '').lower()))
    return jsonify({'participants': out})


@platform_bp.route('/events/<int:id>/registration', methods=['GET'])
@jwt_required()
def get_registration(id):
    u = current_user()
    p = Participant.query.filter_by(gathering_id=id, user_id=u.id).first() if u else None
    return jsonify({'answer': p.answer if p else None, 'roleId': p.role_id if p else None})


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

    # Роль — тем же сервисом и с тем же контрактом ошибки, что guest.put_rsvp. Это ОДНО
    # действие в двух роутах: разойдутся — получим «роль исчезает при записи из ленты».
    db.session.flush()
    ok, err_ru, err_kz, status = sync_participant_role(g_, p, data)
    if not ok:
        db.session.rollback()
        g_ = db.session.get(Gathering, id)
        return jsonify({'error': err_ru, 'errorKz': err_kz,
                        'roles': serialize_roles(g_) if g_ else []}), status

    if answer != prev_answer and u.id != g_.owner_id:
        from services.notifications import notify_owner_answer
        notify_owner_answer(g_, u.full_name or 'Участник', answer)
    g_.bump()
    db.session.commit()
    going = g_.going_cache if g_.going_cache is not None else sum(1 for x in g_.participants if x.answer == 'yes')
    # roles — в успешном ответе: экран события знает только id, и после записи выбирать
    # роль было бы не из чего (карточка ленты их тоже несёт, но здесь они свежее).
    return jsonify({'answer': answer, 'going': going,
                    'roleId': p.role_id, 'roles': serialize_roles(g_)})


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


@platform_bp.route('/me/events', methods=['GET'])
@profiled_required
def my_events():
    """События, на которые волонтёр записался (RSVP): карточка + его ответ и явка.
    Для страницы «Мои мероприятия». Скрытые сборы (deleted/pending/rejected) пропускаем."""
    parts = (Participant.query
             .filter(Participant.user_id == g.user.id, Participant.answer.isnot(None))
             .all())
    out = []
    for p in parts:
        gathering = db.session.get(Gathering, p.gathering_id)
        if gathering is None or gathering.status in ('deleted', 'pending', 'rejected'):
            continue
        card = serialize_event_card(gathering, g.user.id)
        card['myAnswer'] = p.answer
        card['myPresence'] = p.presence
        card['myRoleId'] = p.role_id     # чип «Твоя роль» в «Моих мероприятиях»
        out.append(card)
    out.sort(key=lambda e: e.get('startsAt') or '')   # ближайшие сверху
    return jsonify({'events': out})


# ── заявка на роль организатора ──
@platform_bp.route('/me/role-request', methods=['GET'])
@profiled_required
def my_role_request():
    """Своя ПОСЛЕДНЯЯ заявка (или null). Одним полем экран решает, что показать:
    кнопку «Стать организатором», «на рассмотрении» или причину отказа."""
    row = (RoleRequest.query.filter_by(user_id=g.user.id)
           .order_by(RoleRequest.created_at.desc(), RoleRequest.id.desc()).first())
    return jsonify({'request': serialize_role_request(row, g.user) if row else None})


@platform_bp.route('/me/role-request', methods=['POST'])
@rate_limit(5, 3600, by_user=True)
@profiled_required
def create_role_request():
    """Подать заявку на роль организатора: {role?: 'coord'|'org', message?}.

    Единственный путь vol → coord после того, как создание сбора перестало повышать роль
    молча. Решает АДМИН (routes/admin.py), поэтому здесь заявка только создаётся —
    никаких изменений User.role.

    Повторная подача при незакрытой заявке — не ошибка, а второй тап по кнопке: отдаём
    ту же строку (идиома add_coordinator/create_conversation), иначе очередь админа
    забилась бы дублями одного человека.
    """
    if g.user.role in ORGANIZER_ROLES:
        return jsonify({'error': 'Вы уже организатор',
                        'errorKz': 'Сіз әлдеқашан ұйымдастырушысыз'}), 409

    data = request.get_json(silent=True) or {}
    role = data.get('role') if data.get('role') in ORGANIZER_ROLES else 'coord'

    pending = RoleRequest.query.filter_by(user_id=g.user.id, status='pending').first()
    if pending is not None:
        return jsonify({'request': serialize_role_request(pending, g.user)}), 200

    row = RoleRequest(user_id=g.user.id, requested_role=role, status='pending',
                      message=(data.get('message') or '').strip()[:1000] or None)
    db.session.add(row)
    db.session.commit()
    return jsonify({'request': serialize_role_request(row, g.user)}), 201


# ── НКО ──
def _ref_exists(model, key):
    """Есть ли строка справочника (Theme/City) с таким id. Не-строку отвергаем сразу:
    db.session.get() на dict/list из тела запроса упал бы 500-й."""
    return isinstance(key, str) and db.session.get(model, key) is not None


def _text(v):
    """Текст из тела запроса → обрезанная строка или None (пустое/не-строка → None)."""
    return (v.strip() or None) if isinstance(v, str) else None


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


@platform_bp.route('/me/orgs', methods=['GET'])
@profiled_required
def my_orgs():
    """Мои организации (я — owner_id): вход в админ-контур НКО.

    Гейтим по владению, а не по User.role: role юзер ставит себе сам через PATCH /me.
    """
    rows = Org.query.filter(Org.owner_id == g.user.id).order_by(Org.id.desc()).all()
    return jsonify({'orgs': [serialize_org(o) for o in rows]})


@platform_bp.route('/orgs/<int:id>', methods=['PATCH'])
@profiled_required
def update_org(id):
    """Редактирование карточки НКО владельцем (или админом).

    verified не трогаем ни при каких данных в теле — статус модерации ставит только
    админ через /admin/orgs/<id>/approve, иначе self-reg верифицировал бы себя сам.
    """
    org = db.session.get(Org, id)
    if org is None:
        return jsonify({'error': 'Организация не найдена'}), 404
    # owner_id у сид-организаций пустой — None == None не должно давать доступ
    is_owner = org.owner_id is not None and org.owner_id == g.user.id
    if not (is_owner or g.user.user_type == 'admin'):
        return jsonify({'error': 'Это не ваша организация'}), 403

    data = request.get_json(silent=True) or {}
    if 'name' in data:
        name = _text(data.get('name'))
        if not name:
            return jsonify({'error': 'Название организации обязательно'}), 400
        org.name = name
    if 'cat' in data:
        cat = data.get('cat') or None
        if cat is not None and not _ref_exists(Theme, cat):
            return jsonify({'error': 'Неизвестная тема'}), 400
        org.cat = cat
    if 'cityId' in data or 'city_id' in data:
        city_id = data.get('cityId') or data.get('city_id') or None
        if city_id is not None and not _ref_exists(City, city_id):
            return jsonify({'error': 'Неизвестный город'}), 400
        org.city_id = city_id
    if 'aboutRu' in data:
        org.about_ru = _text(data.get('aboutRu'))
    if 'aboutKz' in data:
        org.about_kz = _text(data.get('aboutKz'))

    db.session.commit()
    return jsonify({'org': serialize_org(org)})


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


@platform_bp.route('/charity', methods=['POST'])
@profiled_required
def create_charity_request():
    """НКО создаёт сбор помощи (деньги/вещи). Только роль 'org'; привязываем к её организации."""
    if g.user.role != 'org':
        return jsonify({'error': 'Сборы помощи создают только НКО'}), 403
    data = request.get_json(silent=True) or {}
    title = (data.get('titleRu') or data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Укажите название'}), 400
    kind = data.get('kind') if data.get('kind') in ('money', 'items') else 'money'
    try:
        goal = max(0, int(data.get('goal', 0) or 0))
    except (TypeError, ValueError):
        goal = 0
    # Цель обязана быть > 0: иначе donate делает raised=min(0,…)=0 (пожертвования
    # никогда не растут), а прогресс на фронте = raised/goal = 0/0 = NaN.
    if goal <= 0:
        return jsonify({'error': 'Укажите цель больше нуля'}), 400
    org = Org.query.filter_by(owner_id=g.user.id).first()
    c = CharityRequest(
        title_ru=title,
        title_kz=(data.get('titleKz') or title).strip(),
        org_id=org.id if org else None,
        city_id=data.get('cityId') or data.get('city_id') or g.user.city_id,
        kind=kind,
        unit=((data.get('unit') or ('₸' if kind == 'money' else 'шт')).strip() or '₸')[:16],
        goal=goal,
        raised=0,
    )
    db.session.add(c)
    db.session.commit()
    return jsonify({'charity': serialize_charity(c)}), 201


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


# ── качество модели прогноза явки ──
@platform_bp.route('/forecast/quality', methods=['GET'])
def forecast_quality():
    """Паспорт модели прогноза: метрики, сравнение с формульными базлайнами,
    важность признаков.

    Публично и намеренно: это ответ на вопрос «а прогноз не просто повторяет число
    подтвердивших?». Все числа — из ml/artifacts/*.json, то есть из того, что
    печатают `python evaluate.py` и `python baseline.py`, и воспроизводятся одной
    командой. Ничего персонального здесь нет.
    """
    from services import attendance_ml

    q = attendance_ml.quality()
    if not q:
        return jsonify({'available': False, **attendance_ml.unavailable_payload()})

    metrics = q.get('metrics') or {}
    baselines = (q.get('baselines') or {}).get('results') or {}
    meta = (q.get('baselines') or {}).get('meta') or {}
    importance = (q.get('featureImportance') or {}).get('ranked') or []

    def _row(key, label_ru, label_kz):
        m = baselines.get(key) or {}
        return {
            'key': key, 'labelRu': label_ru, 'labelKz': label_kz,
            'rocAuc': m.get('roc_auc'), 'prAuc': m.get('pr_auc'),
            'brier': m.get('brier'), 'f1': m.get('f1_at_0.5'),
            'expectedSum': m.get('expected_sum'),
            'absExpectedError': m.get('abs_expected_error'),
        }

    return jsonify({
        'available': attendance_ml.is_available(),
        'model': attendance_ml.model_info() or {
            'name': metrics.get('model_name'), 'calibrated': True,
            'rocAuc': metrics.get('roc_auc'), 'brier': metrics.get('brier'),
            'nTest': metrics.get('n_test'),
        },
        'metrics': {
            'rocAuc': metrics.get('roc_auc'), 'prAuc': metrics.get('pr_auc'),
            'brier': metrics.get('brier'), 'logLoss': metrics.get('log_loss'),
            'accuracy': metrics.get('accuracy'), 'f1': metrics.get('f1_pos'),
            'nTest': metrics.get('n_test'), 'threshold': metrics.get('threshold'),
            'confusionMatrix': metrics.get('confusion_matrix'),
        },
        'testSet': {
            'nTest': meta.get('n_test') or metrics.get('n_test'),
            'actualCame': meta.get('actual_came'),
            'split': 'GroupShuffleSplit по волонтёрам (история одного человека не попадает разом в train и test)',
            'data': 'synthetic',
        },
        # Порядок строк = порядок аргумента: наивный счётчик, формула, модель.
        'comparison': [
            _row('answer_only', 'Счётчик «по ответу»', '«Жауап бойынша» санауыш'),
            _row('formula', 'Формула base·trust·ctx', 'base·trust·ctx формуласы'),
            _row('model', 'ML-модель (калибр.)', 'ML-модель (калибр.)'),
        ],
        'lift': {
            'vsAnswerOnly': (q.get('baselines') or {}).get('lift_roc_auc_vs_answer_only'),
            'vsFormula': (q.get('baselines') or {}).get('lift_roc_auc_vs_formula'),
        },
        'featureImportance': [
            {'feature': r.get('feature'), 'importance': r.get('importance_mean'),
             'std': r.get('importance_std')}
            for r in importance
        ],
    })
