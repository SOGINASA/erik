"""Участник: публичный просмотр сбора по коду и RSVP по устройству.

Инвариант: /g/<code> НЕ отдаёт прогноз, ростер и телефоны (serialize_gathering_public).
Прогноз участнику не показываем осознанно (самосбывающееся пророчество).
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from models import db, Gathering, Participant, ANSWERS
from services.identity import current_user
from utils.serializers import serialize_gathering_public

guest_bp = Blueprint('guest', __name__)


def _find_open(code):
    return Gathering.query.filter(
        db.func.upper(Gathering.code) == (code or '').upper(),
        Gathering.status != 'deleted',
    ).first()


def _my_participant(gathering, user):
    if user is None:
        return None
    return Participant.query.filter_by(gathering_id=gathering.id, user_id=user.id).first()


@guest_bp.route('/g/<code>', methods=['GET'])
@jwt_required(optional=True)
def guest_view(code):
    gathering = _find_open(code)
    if gathering is None:
        return jsonify({'error': 'Сбор не найден'}), 404
    mine = _my_participant(gathering, current_user())
    return jsonify({'gathering': serialize_gathering_public(
        gathering, my_answer=mine.answer if mine else None)})


@guest_bp.route('/gatherings/by-code/<code>', methods=['GET'])
@jwt_required(optional=True)
def by_code(code):
    """CodeSheet: проверить код и получить публичную сводку."""
    gathering = _find_open(code)
    if gathering is None:
        return jsonify({'error': 'Сбор не найден'}), 404
    return jsonify({'gathering': serialize_gathering_public(gathering)})


@guest_bp.route('/g/<code>/rsvp', methods=['GET'])
@jwt_required()
def get_rsvp(code):
    gathering = _find_open(code)
    if gathering is None:
        return jsonify({'error': 'Сбор не найден'}), 404
    mine = _my_participant(gathering, current_user())
    return jsonify({'answer': mine.answer if mine else None})


@guest_bp.route('/g/<code>/rsvp', methods=['PUT'])
@jwt_required()
def put_rsvp(code):
    """Ответ участника: {answer, name?, phone?}. Привязка к device-User."""
    user = current_user()
    if user is None:
        return jsonify({'error': 'Пользователь не найден'}), 404
    gathering = _find_open(code)
    if gathering is None:
        return jsonify({'error': 'Сбор не найден'}), 404
    if gathering.status != 'open':
        return jsonify({'error': 'Сбор уже завершён'}), 409

    data = request.get_json(silent=True) or {}
    answer = data.get('answer')
    if answer not in ANSWERS:
        return jsonify({'error': 'answer ∈ yes|maybe|no'}), 400

    # дозаполняем личность
    name = (data.get('name') or '').strip()
    if name and not (user.full_name or '').strip():
        user.full_name = name
    phone = (data.get('phone') or '').strip()
    if phone and not (user.phone or '').strip():
        user.phone = phone

    now = datetime.now(timezone.utc)
    part = _my_participant(gathering, user)
    if part is None:
        part = Participant(
            gathering_id=gathering.id, user_id=user.id,
            name=user.full_name or name or 'Гость',
            phone=user.phone,
            hist_total_at_rsvp=user.trust_total or 0,
            hist_came_at_rsvp=user.trust_came or 0,
            answered_at=now,
        )
        db.session.add(part)
    part.answer = answer
    part.answered_at = now
    if user.full_name:
        part.name = user.full_name
    if user.phone:
        part.phone = user.phone

    gathering.bump()
    db.session.commit()

    coming = sum(1 for p in gathering.participants if p.answer == 'yes')
    return jsonify({'answer': answer, 'comingCount': coming})
