"""Сбор координатора: создание, просмотр, прогноз, поллинг, редактирование,
управление ростером, отметка явки (в т.ч. офлайн-синк), финализация.

Все эндпоинты — coordinator-owner, кроме POST / (создание) и by-code.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g, current_app
from flask_jwt_extended import jwt_required

from models import (
    db, User, Gathering, GatheringCoordinator, Participant, Theme, City, Org,
    ANSWERS, PRESENCES,
)
from services.codes import generate_code
from services.forecast import forecast_payload, finalize_gathering
from services.context import compute_ctx
from services.identity import current_user
from utils.decorators import profiled_required, gathering_owner_required
from utils.serializers import (
    serialize_gathering_owner, serialize_gathering_card, serialize_participant,
    serialize_coordinator,
)

gatherings_bp = Blueprint('gatherings', __name__)


def _parse_starts_at(date_str, time_str):
    """'2026-07-18' + '10:00' → aware datetime (UTC)."""
    try:
        d = (date_str or '').strip()
        t = (time_str or '00:00').strip()
        dt = datetime.strptime(f'{d} {t}', '%Y-%m-%d %H:%M')
        return dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _clamp_needed(n, default=20):
    try:
        return max(1, min(200, int(n)))
    except (ValueError, TypeError):
        return default


def _taxonomy_fields(data, user):
    """{theme, cityId, orgId, imageUrl} из тела → поля модели. → (fields, error, status).

    Лента фильтрует сборы ИМЕННО по theme/city_id (platform.py:_feed_query), поэтому
    молча проглатывать эти поля нельзя — сбор навсегда выпадет из ленты.
    Ключа нет в теле → нет и в fields (PATCH ничего не затирает); пустая строка → None.
    """
    fields = {}

    if 'theme' in data:
        theme = str(data.get('theme') or '').strip() or None
        if theme is not None and db.session.get(Theme, theme) is None:
            return None, 'Неизвестная тема', 400
        fields['theme'] = theme

    if 'cityId' in data:
        city_id = str(data.get('cityId') or '').strip() or None
        if city_id is not None and db.session.get(City, city_id) is None:
            return None, 'Неизвестный город', 400
        fields['city_id'] = city_id

    if 'orgId' in data:
        raw = data.get('orgId')
        if raw in (None, '', 0):
            fields['org_id'] = None
        else:
            try:
                org_id = int(raw)
            except (ValueError, TypeError):
                return None, 'orgId должен быть числом', 400
            org = db.session.get(Org, org_id)
            if org is None:
                return None, 'Организация не найдена', 400
            # Граница — только владение (Org.owner_id). User.role юзер ставит себе сам.
            if org.owner_id != user.id:
                return None, 'Это не ваша организация', 403
            fields['org_id'] = org_id

    if 'imageUrl' in data:
        url = str(data.get('imageUrl') or '').strip()
        # только http(s): иначе в обложку прилетит javascript:/data: и выстрелит на фронте
        if url and not url.startswith(('http://', 'https://')):
            return None, 'imageUrl должен быть http(s)-ссылкой', 400
        fields['image_url'] = url[:300] or None

    return fields, None, None


# ── создание ──
@gatherings_bp.route('', methods=['POST'])
@jwt_required()
def create_gathering():
    """Тело формы NewGathering: {what, where, date, time, needed, name?}
    + необязательные {theme, cityId, orgId, imageUrl, titleKz, placeKz}.

    Device-уровень (имя даётся ЗДЕСЬ, при первом сборе) — поэтому НЕ @profiled_required,
    иначе новичок без имени не смог бы создать первый сбор.
    """
    user = current_user()
    if user is None or not user.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    data = request.get_json(silent=True) or {}

    what = (data.get('what') or data.get('title') or '').strip()
    where = (data.get('where') or data.get('place') or '').strip()
    if not what:
        return jsonify({'error': 'Укажите, что делаем'}), 400

    taxonomy, err, code = _taxonomy_fields(data, user)
    if err:
        return jsonify({'error': err}), code

    # KZ по умолчанию = RU (форма одноязычная), но явный titleKz/placeKz уважаем
    what_kz = (data.get('titleKz') or '').strip() or what
    where_kz = (data.get('placeKz') or '').strip() or where

    # имя при первом сборе
    name = (data.get('name') or '').strip()
    if name and not (user.full_name or '').strip():
        user.full_name = name
    if user.role == 'vol':
        user.role = 'coord'

    starts_at = _parse_starts_at(data.get('date'), data.get('time'))
    gathering = Gathering(
        code=generate_code(title=what, when=starts_at),
        owner_id=user.id,
        title_ru=what, title_kz=what_kz,
        place_ru=where, place_kz=where_kz,
        starts_at=starts_at,
        needed=_clamp_needed(data.get('needed', 20)),
        format=data.get('format') if data.get('format') in ('one', 'reg') else 'one',
        # Новый сбор уходит на модерацию к админу; в ленту/на карту попадёт только
        # после одобрения (status='open'). Уведомление подписчикам НКО — при одобрении.
        status='pending', ctx=compute_ctx(starts_at),   # реальный контекст (день недели/lead-time)
        **taxonomy,                                     # theme/city_id/org_id/image_url
    )
    db.session.add(gathering)
    db.session.flush()
    db.session.add(GatheringCoordinator(gathering_id=gathering.id, user_id=user.id, role='owner'))
    db.session.commit()

    share_url = f"{current_app.config['SHARE_BASE_URL']}/g/{gathering.code}"
    return jsonify({
        'id': gathering.id,
        'code': gathering.code,
        'shareUrl': share_url,
        'role': user.role,   # мог повыситься vol → coord выше; фронту иначе неоткуда узнать до boot()
        'gathering': serialize_gathering_owner(gathering),
    }), 201


# ── просмотр / прогноз / поллинг ──
@gatherings_bp.route('/<int:id>', methods=['GET'])
@gathering_owner_required
def get_gathering(id):
    return jsonify({'gathering': serialize_gathering_owner(g.gathering)})


@gatherings_bp.route('/<int:id>/forecast', methods=['GET'])
@gathering_owner_required
def get_forecast(id):
    return jsonify(forecast_payload(g.gathering))


@gatherings_bp.route('/<int:id>/ml-forecast', methods=['GET'])
@gathering_owner_required
def get_ml_forecast(id):
    """ML-прогноз явки (обучаемая модель из ml/). Компаньон аналитического /forecast.
    Если модель не обучена/недоступна — отдаёт {'available': False, ...}, не 5xx."""
    from services.attendance_ml import forecast_gathering
    return jsonify(forecast_gathering(g.gathering))


@gatherings_bp.route('/<int:id>/poll', methods=['GET'])
@gathering_owner_required
def poll(id):
    """Delta-поллинг: since=<revision>. Если ревизия не изменилась — changed:[]."""
    gathering = g.gathering
    try:
        since = int(request.args.get('since', -1))
    except (ValueError, TypeError):
        since = -1
    rev = gathering.revision or 0
    if since == rev:
        return jsonify({'revision': rev, 'changed': [], 'forecast': forecast_payload(gathering)})
    changed = [serialize_participant(p, coordinator=True) for p in gathering.participants]
    return jsonify({'revision': rev, 'changed': changed, 'forecast': forecast_payload(gathering)})


@gatherings_bp.route('/<int:id>/share', methods=['GET'])
@gathering_owner_required
def share(id):
    gathering = g.gathering
    url = f"{current_app.config['SHARE_BASE_URL']}/g/{gathering.code}"
    when_ru = gathering.title_ru
    text_ru = (f'«{gathering.title_ru}» — {gathering.place_ru}. '
               f'Отметьтесь одним тапом: {url}')
    text_kz = (f'«{gathering.title_kz}» — {gathering.place_kz}. '
               f'Бір рет тап басып белгіленіңіз: {url}')
    return jsonify({'code': gathering.code, 'url': url, 'text_ru': text_ru, 'text_kz': text_kz})


# ── редактирование / удаление ──
@gatherings_bp.route('/<int:id>', methods=['PATCH'])
@gathering_owner_required
def update_gathering(id):
    """Правка сбора. Помимо {what, where, date, time, needed} принимает
    {titleKz, placeKz, theme, cityId, orgId, imageUrl}."""
    gathering = g.gathering
    data = request.get_json(silent=True) or {}

    # Привязку к НКО меняет ТОЛЬКО владелец сбора: со-координатора зовут ради отметки
    # явки, а не чтобы увести сбор в свою оргу. Счётчики НКО и /leaderboard/orgs
    # считаются по Gathering.org_id (serializers.py:serialize_org), поэтому и отвязка
    # (orgId: null) — тоже привилегированное действие; гейт по наличию ключа, не значения.
    if 'orgId' in data and not _is_owner(gathering, g.user):
        return jsonify({'error': 'Только владелец сбора меняет организацию'}), 403

    taxonomy, err, code = _taxonomy_fields(data, g.user)
    if err:
        return jsonify({'error': err}), code
    for attr, value in taxonomy.items():
        setattr(gathering, attr, value)

    # what/where зеркалим в оба языка (фронт шлёт одну строку), но явные
    # titleKz/placeKz ниже перекрывают зеркало — иначе KZ-версия терялась при каждом PATCH
    if 'what' in data or 'title' in data:
        v = (data.get('what') or data.get('title') or '').strip()
        if v:
            gathering.title_ru = gathering.title_kz = v
    if 'where' in data or 'place' in data:
        v = (data.get('where') or data.get('place') or '').strip()
        gathering.place_ru = gathering.place_kz = v
    if 'titleKz' in data:
        v = (data.get('titleKz') or '').strip()
        if v:
            gathering.title_kz = v
    if 'placeKz' in data:
        gathering.place_kz = (data.get('placeKz') or '').strip()
    if 'needed' in data:
        gathering.needed = _clamp_needed(data['needed'], gathering.needed)
    if 'date' in data or 'time' in data:
        dt = _parse_starts_at(
            data.get('date') or (gathering.starts_at and gathering.starts_at.strftime('%Y-%m-%d')),
            data.get('time') or (gathering.starts_at and gathering.starts_at.strftime('%H:%M')),
        )
        if dt:
            gathering.starts_at = dt
    gathering.bump()
    db.session.commit()
    return jsonify({'gathering': serialize_gathering_owner(gathering)})


@gatherings_bp.route('/<int:id>', methods=['DELETE'])
@gathering_owner_required
def delete_gathering(id):
    # Удаление необратимо (сбор пропадает у всех) — это привилегия ВЛАДЕЛЬЦА, а не
    # со-координатора: декоратор пускает и cocoord, его зовут ради отметки явки.
    if not _is_owner(g.gathering, g.user):
        return jsonify({'error': 'Только владелец сбора может его удалить'}), 403
    g.gathering.status = 'deleted'
    db.session.commit()
    return '', 204


@gatherings_bp.route('/<int:id>/resubmit', methods=['POST'])
@gathering_owner_required
def resubmit_gathering(id):
    """Пересдать отклонённый сбор на повторную модерацию. Только владелец (как
    add/remove-coordinator): статус 'rejected' → 'pending', причина снимается."""
    gathering = g.gathering
    if not _is_owner(gathering, g.user):
        return jsonify({'error': 'Только владелец сбора может пересдать его'}), 403
    if gathering.status != 'rejected':
        return jsonify({'error': 'Пересдать можно только отклонённый сбор'}), 409
    gathering.status = 'pending'
    gathering.reject_reason = None
    gathering.bump()
    db.session.commit()
    return jsonify({'gathering': serialize_gathering_owner(gathering)})


# ── со-координаторы ──
# Читать список может любой владеющий сбором (owner + cocoord), а вот менять состав —
# ТОЛЬКО владелец: иначе со-координатор смог бы добавить своих или разжаловать коллег.
@gatherings_bp.route('/<int:id>/coordinators', methods=['GET'])
@gathering_owner_required
def list_coordinators(id):
    rows = GatheringCoordinator.query.filter_by(gathering_id=g.gathering.id).all()
    return jsonify({'coordinators': [serialize_coordinator(c) for c in rows]})


@gatherings_bp.route('/<int:id>/coordinators', methods=['POST'])
@gathering_owner_required
def add_coordinator(id):
    """{userId} → добавить со-координатора (role='cocoord'). Только владелец."""
    gathering = g.gathering
    if not _is_owner(gathering, g.user):
        return jsonify({'error': 'Только владелец сбора управляет координаторами'}), 403

    data = request.get_json(silent=True) or {}
    try:
        user_id = int(data.get('userId'))
    except (ValueError, TypeError):
        return jsonify({'error': 'Укажите userId'}), 400

    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    if user_id == gathering.owner_id:
        return jsonify({'error': 'Владелец уже координатор сбора'}), 400

    # повторный вызов не должен падать на uq_gcoord — отдаём существующую строку
    row = GatheringCoordinator.query.filter_by(
        gathering_id=gathering.id, user_id=user_id).first()
    if row is not None:
        return jsonify({'coordinator': serialize_coordinator(row, user)})

    row = GatheringCoordinator(gathering_id=gathering.id, user_id=user_id, role='cocoord')
    db.session.add(row)
    db.session.commit()
    return jsonify({'coordinator': serialize_coordinator(row, user)}), 201


@gatherings_bp.route('/<int:id>/coordinators/<int:user_id>', methods=['DELETE'])
@gathering_owner_required
def remove_coordinator(id, user_id):
    """Снять со-координатора. Только владелец; владельца снять нельзя (сбор осиротеет)."""
    gathering = g.gathering
    if not _is_owner(gathering, g.user):
        return jsonify({'error': 'Только владелец сбора управляет координаторами'}), 403

    row = GatheringCoordinator.query.filter_by(
        gathering_id=gathering.id, user_id=user_id).first()
    if row is None:
        return jsonify({'error': 'Координатор не найден'}), 404
    if row.role == 'owner' or user_id == gathering.owner_id:
        return jsonify({'error': 'Владельца снять нельзя'}), 400

    db.session.delete(row)
    db.session.commit()
    return '', 204


@gatherings_bp.route('/<int:id>/finalize', methods=['POST'])
@gathering_owner_required
def finalize(id):
    summary = finalize_gathering(g.gathering)
    return jsonify(summary)


@gatherings_bp.route('/<int:id>/remind', methods=['POST'])
@gathering_owner_required
def remind(id):
    """RemindSheet: напомнить сомневающимся (или всем). Создаёт уведомления."""
    from services.notifications import notify_reminder
    from models import REMIND_AUDIENCES
    data = request.get_json(silent=True) or {}
    audience = data.get('audience') if data.get('audience') in REMIND_AUDIENCES else 'maybe'
    text_ru = (data.get('text_ru') or data.get('text') or '').strip() or None
    text_kz = (data.get('text_kz') or data.get('text') or '').strip() or None
    count = notify_reminder(g.gathering, audience, text_ru, text_kz, g.user.id)
    return jsonify({'recipient_count': count, 'audience': audience})


# ── ростер (координатор) ──
@gatherings_bp.route('/<int:id>/participants/<int:pid>', methods=['PATCH'])
@gathering_owner_required
def set_participant_answer(id, pid):
    """PersonSheet: координатор меняет ответ участника."""
    # RSVP на завершённом/отклонённом сборе не меняем: finalize уже посчитал явку
    # по тогдашним ответам — правка задним числом разошлась бы с итогом.
    if _finalized(g.gathering):
        return jsonify({'error': 'Сбор завершён — ответы больше не меняются'}), 409
    part = _get_participant(g.gathering, pid)
    if part is None:
        return jsonify({'error': 'Участник не найден'}), 404
    data = request.get_json(silent=True) or {}
    answer = data.get('answer')
    if answer not in ANSWERS:
        return jsonify({'error': 'answer ∈ yes|maybe|no'}), 400
    part.answer = answer
    g.gathering.bump()
    db.session.commit()
    return jsonify({
        'participant': serialize_participant(part, coordinator=True),
        'counts': _counts(g.gathering),
    })


@gatherings_bp.route('/<int:id>/participants/<int:pid>', methods=['DELETE'])
@gathering_owner_required
def remove_participant(id, pid):
    part = _get_participant(g.gathering, pid)
    if part is None:
        return jsonify({'error': 'Участник не найден'}), 404
    db.session.delete(part)
    g.gathering.bump()
    db.session.commit()
    return '', 204


@gatherings_bp.route('/<int:id>/participants', methods=['POST'])
@gathering_owner_required
def add_guest(id):
    """GuestSheet: координатор вписывает пришедшего вручную (walk-in)."""
    # На завершённом/отклонённом сборе новых участников не заводим (finalize уже
    # зафиксировал итог) — walk-in задним числом раздул бы ростер мимо статистики.
    if _finalized(g.gathering):
        return jsonify({'error': 'Сбор завершён — новых участников не добавить'}), 409
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Имя обязательно'}), 400
    present = data.get('present', True)
    part = Participant(
        gathering_id=g.gathering.id, user_id=None, name=name, is_guest=True,
        answer='yes', presence='came' if present else None,
        checked_in_at=datetime.now(timezone.utc) if present else None,
        client_mark_id=data.get('clientMarkId'),
    )
    db.session.add(part)
    g.gathering.bump()
    db.session.commit()
    return jsonify({'participant': serialize_participant(part, coordinator=True)}), 201


@gatherings_bp.route('/<int:id>/participants/<int:pid>/history', methods=['GET'])
@gathering_owner_required
def participant_history(id, pid):
    part = _get_participant(g.gathering, pid)
    if part is None:
        return jsonify({'error': 'Участник не найден'}), 404
    return jsonify(part.history)


# ── отметка явки (owner) ──
@gatherings_bp.route('/<int:id>/checkin', methods=['GET'])
@gathering_owner_required
def checkin_pool(id):
    """Пул для отметки: все, кто НЕ ответил 'no'. + текущие отметки + revision."""
    gathering = g.gathering
    pool = [p for p in gathering.participants if p.answer != 'no']
    marked = sum(1 for p in pool if p.presence == 'came')
    return jsonify({
        'revision': gathering.revision or 0,
        'total': len(pool),
        'marked': marked,
        'participants': [serialize_participant(p, coordinator=True) for p in pool],
    })


@gatherings_bp.route('/<int:id>/participants/<int:pid>/presence', methods=['PUT'])
@gathering_owner_required
def set_presence(id, pid):
    """Онлайн-отметка: {present: bool, clientMarkId?, ts?} + опционально presence.

    present:false по умолчанию СНИМАЕТ отметку (presence=None) — фронт шлёт булев
    тогл (useGatheringStore), и «не отмечен» ≠ «не пришёл». Чтобы организатор мог
    пометить неявку ДО финализации, есть явная форма: {presence: 'missed'|'came'} —
    она перекрывает present. Раньше 'missed' писала только finalize_gathering.
    """
    # После finalize ('done') явку не переотмечаем: итог зафиксирован (finalized_at,
    # trust_*), а онлайн-тогл задним числом молча разошёлся бы с ним. Штатный чекин
    # идёт на 'open'-сборе и сюда не попадает. Офлайн-очередь — отдельно (presence_batch).
    if _finalized(g.gathering):
        return jsonify({'error': 'Сбор завершён — явку уже не переотметить'}), 409
    part = _get_participant(g.gathering, pid)
    if part is None:
        return jsonify({'error': 'Участник не найден'}), 404
    data = request.get_json(silent=True) or {}
    explicit = data.get('presence')
    if explicit is not None and explicit not in PRESENCES:
        return jsonify({'error': 'presence ∈ came|missed'}), 400
    if explicit is not None:
        part.presence = explicit
    else:
        part.presence = 'came' if bool(data.get('present', True)) else None
    part.checked_in_at = datetime.now(timezone.utc) if part.presence == 'came' else None
    g.gathering.bump()
    db.session.commit()
    return jsonify({'presence': part.presence, 'revision': g.gathering.revision})


@gatherings_bp.route('/<int:id>/presence/batch', methods=['POST'])
@gathering_owner_required
def presence_batch(id):
    """Офлайн-синк: идемпотентное применение очереди отметок.

    Тело: {baseRevision?, ops:[{clientMarkId, pid?, present, ts?, guestName?, presence?}]}.
    Гости узнаются по clientMarkId (повтор очереди не создаёт дублей).
    presence — та же явная форма, что и в PUT .../presence (см. set_presence).
    """
    gathering = g.gathering
    data = request.get_json(silent=True) or {}
    ops = data.get('ops') or []
    applied, conflicts = [], []
    now = datetime.now(timezone.utc)

    # baseRevision — ревизия, на которой клиент собрал офлайн-очередь. Само применение
    # НЕ трогаем (идемпотентность по clientMarkId + last-write-wins), но если сервер с тех
    # пор ушёл вперёд (base < текущей revision), помечаем ответ staleBase — сигнал клиенту
    # перечитать ростер: он применял поверх устаревшего снимка. Сравниваем ДО bump().
    try:
        base_rev = int(data.get('baseRevision'))
    except (ValueError, TypeError):
        base_rev = None
    stale_base = base_rev is not None and base_rev < (gathering.revision or 0)

    for op in ops:
        cmid = op.get('clientMarkId')
        present = bool(op.get('present', True))
        pid = op.get('pid')
        guest_name = (op.get('guestName') or '').strip()

        part = None
        if pid is not None:
            part = _get_participant(gathering, pid)
        elif cmid:
            part = Participant.query.filter_by(gathering_id=gathering.id, client_mark_id=cmid).first()

        if part is None and guest_name:
            # новый гость (или повтор — но повтор поймался бы по client_mark_id выше)
            part = Participant(
                gathering_id=gathering.id, user_id=None, name=guest_name, is_guest=True,
                answer='yes', client_mark_id=cmid,
            )
            db.session.add(part)
            db.session.flush()

        if part is None:
            conflicts.append({'clientMarkId': cmid, 'reason': 'not_found'})
            continue

        explicit = op.get('presence')
        part.presence = explicit if explicit in PRESENCES else ('came' if present else None)
        part.checked_in_at = now if part.presence == 'came' else None
        applied.append({'clientMarkId': cmid, 'pid': part.id, 'presence': part.presence})

    gathering.bump()
    db.session.commit()
    return jsonify({'revision': gathering.revision, 'applied': applied,
                    'conflicts': conflicts, 'staleBase': stale_base})


# ── список своих сборов ──
@gatherings_bp.route('/mine', methods=['GET'])
@profiled_required
def my_gatherings():
    # Всё, кроме удалённого: отклонённый ('rejected') остаётся виден владельцу,
    # чтобы он увидел причину и пересдал сбор (см. resubmit).
    rows = (Gathering.query
            .filter(Gathering.owner_id == g.user.id, Gathering.status != 'deleted')
            .order_by(Gathering.created_at.desc())
            .all())
    return jsonify({'gatherings': [serialize_gathering_card(x) for x in rows]})


# ── helpers ──
def _is_owner(gathering, user):
    """Владелец сбора (в отличие от со-координатора, которого пускает декоратор).
    Смотрим и owner_id, и строку role='owner' — в сидах ростер бывает без owner_id."""
    if gathering.owner_id == user.id:
        return True
    return db.session.query(GatheringCoordinator.id).filter_by(
        gathering_id=gathering.id, user_id=user.id, role='owner').first() is not None


def _finalized(gathering):
    """Сбор завершён ('done') или отклонён ('rejected') — ростер заморожен.

    На 'done' finalize уже посчитал итоговую явку и записал агрегаты (trust_*, часы,
    finalized_at); на 'rejected' сбор так и не открывали. Правки ростера задним числом
    (новый участник, смена RSVP, переотметка явки) молча разошлись бы с итогом finalize,
    поэтому add_guest / set_participant_answer / set_presence на таком сборе → 409.
    Штатный чекин идёт на 'open'-сборе и не затрагивается. Офлайн-очередь (presence_batch)
    намеренно НЕ гейтим: её устойчивость (идемпотентный синк) важнее — см. presence_batch."""
    return gathering.status in ('done', 'rejected')


def _get_participant(gathering, pid):
    for p in gathering.participants:
        if p.id == pid:
            return p
    return None


def _counts(gathering):
    from services.forecast import compute_forecast
    return compute_forecast(gathering.participants, gathering.ctx or 1.0)['counts']
