from functools import wraps

from flask import jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity


def admin_required(fn):
    """Пропускает только пользователей с user_type='admin' в JWT."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get('user_type') != 'admin':
            return jsonify({'error': 'Требуются права администратора'}), 403
        return fn(*args, **kwargs)
    return wrapper


def profiled_required(fn):
    """«authed-user»: валидный токен + заполнена личность (имя).

    По готовой форме фронта пароля нет — «вход» это device-сессия с именем.
    Кладёт User в flask.g.user.
    """
    from services.identity import current_user

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = current_user()
        if user is None or not user.is_active:
            return jsonify({'error': 'Пользователь не найден'}), 404
        if not user.has_profile:
            return jsonify({'error': 'Заполните имя, чтобы продолжить'}), 403
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def gathering_owner_required(fn):
    """«coordinator-owner»: вызывающий владеет сбором (owner или со-координатор).

    Берёт id сбора из kwargs (`id` или `gathering_id`). Кладёт сбор в flask.g.gathering
    и пользователя в flask.g.user.
    """
    from models import db, Gathering, GatheringCoordinator
    from services.identity import current_user

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = current_user()
        if user is None or not user.is_active:
            return jsonify({'error': 'Пользователь не найден'}), 404

        gid = kwargs.get('id') or kwargs.get('gathering_id')
        gathering = db.session.get(Gathering, gid) if gid is not None else None
        if gathering is None or gathering.status == 'deleted':
            return jsonify({'error': 'Сбор не найден'}), 404

        is_owner = gathering.owner_id == user.id
        is_coord = db.session.query(GatheringCoordinator.id).filter_by(
            gathering_id=gathering.id, user_id=user.id
        ).first() is not None
        if not (is_owner or is_coord):
            return jsonify({'error': 'Это не ваш сбор'}), 403

        g.user = user
        g.gathering = gathering
        return fn(*args, **kwargs)
    return wrapper
