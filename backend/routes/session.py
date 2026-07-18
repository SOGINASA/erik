"""Device-сессия и профиль (P0-вход без пароля/OTP).

POST /api/session — bootstrap/резюме устройства и, при name+role, регистрация.
GET/PATCH /api/me — свой профиль.  POST /api/logout — выход (stateless).
"""
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required

from models import db, USER_ROLES
from services.identity import resolve_device_user, make_tokens, current_user
from utils.decorators import profiled_required

session_bp = Blueprint('session', __name__)


def _device_id(data):
    return (data.get('deviceId') or request.headers.get('X-Device-Id') or '').strip() or None


@session_bp.route('/session', methods=['POST'])
def session():
    """Поднять/найти пользователя по устройству. Тело: {deviceId, name?, role?, phone?}."""
    data = request.get_json(silent=True) or {}
    device_id = _device_id(data)
    if not device_id:
        return jsonify({'error': 'deviceId обязателен'}), 400

    existed = False
    from models import User
    if device_id:
        existed = db.session.query(User.id).filter_by(device_id=device_id).first() is not None

    user, created = resolve_device_user(
        device_id=device_id,
        name=data.get('name'),
        role=data.get('role'),
        phone=data.get('phone'),
        user_agent=request.headers.get('User-Agent'),
    )
    access, refresh = make_tokens(user)
    return jsonify({
        'token': access,
        'refreshToken': refresh,
        'user': user.to_dict(include_sensitive=True),
        'known': existed,
    }), (200 if existed else 201)


@session_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user = current_user()
    if user is None or not user.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    return jsonify({'user': user.to_dict(include_sensitive=True)})


@session_bp.route('/me', methods=['PATCH'])
@profiled_required
def update_me():
    user = g.user
    data = request.get_json(silent=True) or {}
    if 'name' in data and (data['name'] or '').strip():
        user.full_name = data['name'].strip()
    if data.get('role') in USER_ROLES:
        user.role = data['role']
    if 'phone' in data:
        user.phone = (data['phone'] or '').strip() or None
    if 'cityId' in data:
        user.city_id = data['cityId'] or None
    if data.get('lang') in ('ru', 'kz'):
        user.lang = data['lang']
    if 'skills' in data and isinstance(data['skills'], list):
        user.skills = data['skills']
    db.session.commit()
    return jsonify({'user': user.to_dict(include_sensitive=True)})


@session_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    # Stateless JWT: клиент просто выбрасывает токен.
    return '', 204
