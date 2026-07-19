"""Device-личность: поднять/найти User по deviceId, выдать токены.

P0-вход без пароля/OTP (по готовой форме фронта): личность узнаётся по устройству.
Токен — тот же JWT-механизм, что и у аккаунтов (sub = str(user.id)).
"""
from datetime import datetime, timezone

from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from models import db, User, USER_ROLES


def make_tokens(user):
    """Пара access/refresh (единый механизм для device и аккаунтов)."""
    claims = {
        'kind': 'user' if user.has_account else 'device',
        'user_type': user.user_type,
        'role': user.role,
        'full_name': user.full_name,
    }
    access = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh = create_refresh_token(identity=str(user.id))
    return access, refresh


def resolve_device_user(device_id, name=None, role=None, phone=None, user_agent=None):
    """Найти пользователя по device_id или создать нового. Возвращает (user, created)."""
    now = datetime.now(timezone.utc)
    created = False

    def _fill_existing(u):
        # дозаполняем то, что пришло и ещё не установлено
        if name and not (u.full_name or '').strip():
            u.full_name = name.strip()
        if role in USER_ROLES:
            u.role = role
        if phone and not (u.phone or '').strip():
            u.phone = phone.strip()
        if user_agent:
            u.user_agent = user_agent

    user = User.query.filter_by(device_id=device_id).first() if device_id else None

    if user is None:
        user = User(
            device_id=device_id,
            full_name=(name or '').strip() or None,
            role=role if role in USER_ROLES else 'vol',
            phone=(phone or '').strip() or None,
            user_agent=user_agent,
            user_type='user',
            is_active=True,
            created_at=now,
        )
        db.session.add(user)
        try:
            # flush пораньше, чтобы поймать гонку по UNIQUE(device_id):
            # StrictMode/две вкладки шлют два POST /session с одним device_id одновременно.
            db.session.flush()
            created = True
        except IntegrityError:
            # Параллельный запрос уже вставил этого device-юзера — берём победителя гонки.
            db.session.rollback()
            user = User.query.filter_by(device_id=device_id).first()
            if user is None:
                raise  # не гонка по device_id — это настоящая ошибка целостности
            _fill_existing(user)
    else:
        _fill_existing(user)

    user.last_seen_at = now
    user.last_login = now
    db.session.commit()
    return user, created


def current_user():
    """User из JWT (или None). Не требует, чтобы токен был; вызывать под @jwt_required."""
    ident = get_jwt_identity()
    if ident is None:
        return None
    try:
        return db.session.get(User, int(ident))
    except (TypeError, ValueError):
        return None
