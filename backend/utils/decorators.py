import time
from collections import defaultdict, deque
from functools import wraps

from flask import jsonify, g, request, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity


# ── лёгкий in-memory rate-limit (без внешних зависимостей) ──
# Скользящее окно на процесс; ключ = IP + имя функции. Для демо/одного воркера достаточно;
# для нескольких воркеров/инстансов вынести в Redis. Отключается под TESTING.
_rl_hits = defaultdict(deque)


def rate_limit(max_calls, per_seconds):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if current_app.config.get('TESTING') or current_app.config.get('RATELIMIT_DISABLED'):
                return fn(*args, **kwargs)
            key = f'{request.remote_addr or "?"}:{fn.__name__}'
            now = time.monotonic()
            dq = _rl_hits[key]
            while dq and now - dq[0] > per_seconds:
                dq.popleft()
            if len(dq) >= max_calls:
                return jsonify({'error': 'Слишком много запросов, попробуйте позже'}), 429
            dq.append(now)
            return fn(*args, **kwargs)
        return wrapper
    return deco


def admin_required(fn):
    """Пропускает только активных пользователей с user_type='admin'.

    Права проверяются по СВЕЖЕЙ записи User из БД, а не только по JWT-claim:
    иначе понижённый/деактивированный пользователь сохранял бы доступ до истечения
    токена (claim не обновляется). g.user — актуальный админ.
    """
    from services.identity import current_user

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = current_user()
        if user is None or not user.is_active or user.user_type != 'admin':
            return jsonify({'error': 'Требуются права администратора'}), 403
        g.user = user
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
