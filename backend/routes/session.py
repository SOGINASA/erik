"""Device-сессия и профиль (P0-вход без пароля/OTP).

POST /api/session — bootstrap/резюме устройства и, при name+role, регистрация.
GET/PATCH /api/me — свой профиль.  POST /api/logout — выход (stateless).
"""
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required

from models import db, User, USER_ROLES
from services.legal import legal_manifest, validate_legal_acceptance, validate_subject_name, record_legal_consent
from services.identity import resolve_device_user, make_tokens, current_user
from utils.decorators import profiled_required, rate_limit

session_bp = Blueprint('session', __name__)


def _device_id(data):
    value = data.get('deviceId') or request.headers.get('X-Device-Id') or ''
    return value.strip() if isinstance(value, str) and len(value.strip()) <= 64 else None


@session_bp.route('/session', methods=['POST'])
@rate_limit(30, 60)
def session():
    """Поднять/найти пользователя по устройству. Тело: {deviceId, name?, role?, phone?}."""
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'Ожидается JSON-объект'}), 400
    device_id = _device_id(data)
    if not device_id:
        return jsonify({'error': 'deviceId обязателен'}), 400

    existing = User.query.filter_by(device_id=device_id).first()
    existed = existing is not None
    if existing is not None and not existing.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    for key in ('name', 'phone'):
        if data.get(key) is not None and not isinstance(data[key], str):
            return jsonify({'error': f'Поле {key} должно быть строкой'}), 400
    role = data.get('role')
    if role is not None and (not isinstance(role, str) or role not in USER_ROLES):
        return jsonify({'error': 'Недопустимая роль'}), 400
    personal_data_supplied = bool((data.get('name') or '').strip() or (data.get('phone') or '').strip())
    snapshot = None
    if personal_data_supplied and (existing is None or not existing.has_profile):
        snapshot, legal_error = validate_legal_acceptance(data)
        if legal_error:
            return legal_error
        name_error = validate_subject_name(data.get('name'))
        if name_error:
            return name_error
    if len((data.get('phone') or '').strip()) > 32:
        return jsonify({'error': 'Телефон должен содержать не более 32 символов'}), 400

    try:
        user, created = resolve_device_user(
            device_id=device_id,
            name=data.get('name'),
            role=data.get('role'),
            phone=data.get('phone'),
            # Anonymous browsing does not need a persistent browser fingerprint.
            user_agent=None,
            commit=False,
        )
        if user is None:
            return jsonify({'error': 'Демо-личность не найдена — запустите flask seed-demo',
                            'errorKz': 'Демо-тұлға табылмады — flask seed-demo іске қосыңыз'}), 404
        consent = record_legal_consent(user, snapshot, 'session.register') if snapshot else None
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Не удалось создать сессию'}), 500

    access, refresh = make_tokens(user)
    return jsonify({
        'token': access,
        'refreshToken': refresh,
        'user': user.to_dict(include_sensitive=True),
        'known': existed,
        **({'legalConsent': consent.to_dict()} if consent else {}),
    }), (200 if existed else 201)


@session_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user = current_user()
    if user is None or not user.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 404
    return jsonify({'user': user.to_dict(include_sensitive=True, include_device=True)})


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
    if 'interests' in data and isinstance(data['interests'], list):
        # Только существующие id тем и не больше четырёх: это вход признака
        # interest_match модели прогноза, мусор туда пускать нельзя.
        from models import Theme
        valid = {t.id for t in Theme.query.all()}
        user.interests = [str(x) for x in data['interests'] if str(x) in valid][:4]
    db.session.commit()
    return jsonify({'user': user.to_dict(include_sensitive=True)})


@session_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    # Stateless JWT: клиент просто выбрасывает токен.
    return '', 204


@session_bp.route('/legal', methods=['GET'])
def legal_documents():
    response = jsonify(legal_manifest())
    response.headers['Cache-Control'] = 'no-store'
    return response
