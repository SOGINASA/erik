"""Сбор координатора: создание, просмотр, прогноз, поллинг, редактирование,
управление ростером, отметка явки (в т.ч. офлайн-синк), финализация.

Все эндпоинты — coordinator-owner, кроме POST / (создание) и by-code.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g, current_app
from flask_jwt_extended import jwt_required

from models import db, Gathering, GatheringCoordinator, Participant, ANSWERS
from services.codes import generate_code
from services.forecast import forecast_payload, finalize_gathering
from utils.decorators import profiled_required, gathering_owner_required
from utils.serializers import (
    serialize_gathering_owner, serialize_gathering_card, serialize_participant,
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


# ── создание ──
@gatherings_bp.route('', methods=['POST'])
@profiled_required
def create_gathering():
    """Тело формы NewGathering: {what, where, date, time, needed, name?}."""
    user = g.user
    data = request.get_json(silent=True) or {}

    what = (data.get('what') or data.get('title') or '').strip()
    where = (data.get('where') or data.get('place') or '').strip()
    if not what:
        return jsonify({'error': 'Укажите, что делаем'}), 400

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
        title_ru=what, title_kz=what,
        place_ru=where, place_kz=where,
        starts_at=starts_at,
        needed=_clamp_needed(data.get('needed', 20)),
        format=data.get('format') if data.get('format') in ('one', 'reg') else 'one',
        status='open', ctx=1.0,
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
    gathering = g.gathering
    data = request.get_json(silent=True) or {}
    if 'what' in data or 'title' in data:
        v = (data.get('what') or data.get('title') or '').strip()
        if v:
            gathering.title_ru = gathering.title_kz = v
    if 'where' in data or 'place' in data:
        v = (data.get('where') or data.get('place') or '').strip()
        gathering.place_ru = gathering.place_kz = v
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
    g.gathering.status = 'deleted'
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
    """Онлайн-отметка: {present: bool, clientMarkId?, ts?}."""
    part = _get_participant(g.gathering, pid)
    if part is None:
        return jsonify({'error': 'Участник не найден'}), 404
    data = request.get_json(silent=True) or {}
    present = bool(data.get('present', True))
    part.presence = 'came' if present else None
    part.checked_in_at = datetime.now(timezone.utc) if present else None
    g.gathering.bump()
    db.session.commit()
    return jsonify({'presence': part.presence, 'revision': g.gathering.revision})


@gatherings_bp.route('/<int:id>/presence/batch', methods=['POST'])
@gathering_owner_required
def presence_batch(id):
    """Офлайн-синк: идемпотентное применение очереди отметок.

    Тело: {baseRevision?, ops:[{clientMarkId, pid?, present, ts?, guestName?}]}.
    Гости узнаются по clientMarkId (повтор очереди не создаёт дублей).
    """
    gathering = g.gathering
    data = request.get_json(silent=True) or {}
    ops = data.get('ops') or []
    applied, conflicts = [], []
    now = datetime.now(timezone.utc)

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

        part.presence = 'came' if present else None
        part.checked_in_at = now if present else None
        applied.append({'clientMarkId': cmid, 'pid': part.id, 'presence': part.presence})

    gathering.bump()
    db.session.commit()
    return jsonify({'revision': gathering.revision, 'applied': applied, 'conflicts': conflicts})


# ── список своих сборов ──
@gatherings_bp.route('/mine', methods=['GET'])
@profiled_required
def my_gatherings():
    rows = (Gathering.query
            .filter(Gathering.owner_id == g.user.id, Gathering.status != 'deleted')
            .order_by(Gathering.created_at.desc())
            .all())
    return jsonify({'gatherings': [serialize_gathering_card(x) for x in rows]})


# ── helpers ──
def _get_participant(gathering, pid):
    for p in gathering.participants:
        if p.id == pid:
            return p
    return None


def _counts(gathering):
    from services.forecast import compute_forecast
    return compute_forecast(gathering.participants, gathering.ctx or 1.0)['counts']
