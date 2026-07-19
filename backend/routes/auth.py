from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from models import db, User
from utils.decorators import rate_limit
from datetime import datetime, timedelta, timezone
import re

auth_bp = Blueprint('auth', __name__)


def validate_email(email):
    """Валидация email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_nickname(nickname):
    """Валидация никнейма: 3-20 символов, буквы, цифры, точки, подчёркивания, дефисы"""
    pattern = r'^[a-zA-Z0-9._-]{3,20}$'
    return bool(re.match(pattern, nickname))


def is_email(identifier):
    """Проверяет, является ли identifier email-ом"""
    return '@' in identifier and '.' in identifier


def make_tokens(user):
    """Создать пару access/refresh токенов для пользователя"""
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={
            'user_type': user.user_type,
            'email': user.email,
            'nickname': user.nickname,
            'full_name': user.full_name,
        }
    )
    refresh_token = create_refresh_token(identity=str(user.id))
    return access_token, refresh_token


@auth_bp.route('/register', methods=['POST'])
@rate_limit(5, 60)
def register():
    """Регистрация пользователя по email или nickname"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Данные не предоставлены'}), 400

    # Поля (email или nickname - хотя бы одно обязательно)
    email = data.get('email', '').strip().lower() if data.get('email') else None
    nickname = data.get('nickname', '').strip() if data.get('nickname') else None
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip() if data.get('full_name') else ''

    # Поддержка identifier (определяем email это или nickname)
    identifier = data.get('identifier', '').strip() if data.get('identifier') else None
    if identifier and not email and not nickname:
        if is_email(identifier):
            email = identifier.lower()
        else:
            nickname = identifier

    if not email and not nickname:
        return jsonify({'error': 'Укажите email или nickname'}), 400

    if not password:
        return jsonify({'error': 'Пароль обязателен'}), 400

    if email and not validate_email(email):
        return jsonify({'error': 'Неверный формат email'}), 400

    if nickname and not validate_nickname(nickname):
        return jsonify({'error': 'Nickname должен содержать 3-20 символов (буквы, цифры, точки, подчёркивания, дефисы)'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Пароль должен содержать минимум 6 символов'}), 400

    if email and User.query.filter_by(email=email).first():
        return jsonify({'error': 'Пользователь с таким email уже существует'}), 400

    if nickname and User.query.filter(db.func.lower(User.nickname) == nickname.lower()).first():
        return jsonify({'error': 'Пользователь с таким nickname уже существует'}), 400

    try:
        import secrets
        # Апгрейд device-личности до аккаунта: если запрос пришёл с известным X-Device-Id,
        # у которого ещё нет пароля — навешиваем email/пароль на ту же строку (сохраняем
        # trust/историю/часы), а не плодим второго пользователя.
        device_id = request.headers.get('X-Device-Id')
        user = None
        if device_id:
            existing = User.query.filter_by(device_id=device_id).first()
            if existing is not None and not existing.has_account:
                user = existing
                user.email = email
                user.nickname = nickname
                if full_name:
                    user.full_name = full_name
                elif not (user.full_name or '').strip():
                    user.full_name = nickname or (email.split('@')[0] if email else None)

        if user is None:
            user = User(
                email=email,
                nickname=nickname,
                full_name=full_name or nickname or (email.split('@')[0] if email else None),
                user_type='user',
                is_active=True,
            )
            db.session.add(user)

        user.is_active = True
        user.is_verified = False
        user.verification_token = secrets.token_urlsafe(24) if email else None
        user.last_login = datetime.now(timezone.utc)
        user.set_password(password)
        db.session.commit()

        # письмо-подтверждение (в dev без SMTP — только лог; флоу verify-email становится достижим)
        if email and user.verification_token:
            try:
                from flask import current_app
                from services.email import send_email
                link = f"{current_app.config['FRONTEND_URL']}/verify-email?token={user.verification_token}"
                send_email(email, 'Подтверждение email erik',
                           f'Подтвердите адрес, перейдя по ссылке:\n{link}')
            except Exception:
                pass  # почта не должна ломать регистрацию

        access_token, refresh_token = make_tokens(user)

        return jsonify({
            'user': user.to_dict(include_sensitive=True),
            'access_token': access_token,
            'refresh_token': refresh_token
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка регистрации: {e}')
        return jsonify({'error': 'Ошибка при создании аккаунта'}), 500


@auth_bp.route('/login', methods=['POST'])
@rate_limit(10, 60)
def login():
    """Вход пользователя по email, nickname или identifier"""
    data = request.get_json()

    if not data or not data.get('password'):
        return jsonify({'error': 'Заполните все поля'}), 400

    password = data.get('password', '')

    identifier = data.get('identifier', '').strip().lower() if data.get('identifier') else ''
    email = data.get('email', '').strip().lower() if data.get('email') else ''
    nickname = data.get('nickname', '').strip().lower() if data.get('nickname') else ''

    user = None

    if identifier:
        if is_email(identifier):
            user = User.query.filter_by(email=identifier, is_active=True).first()
        else:
            user = User.query.filter(
                db.func.lower(User.nickname) == identifier,
                User.is_active == True
            ).first()
    elif email:
        user = User.query.filter_by(email=email, is_active=True).first()
    elif nickname:
        user = User.query.filter(
            db.func.lower(User.nickname) == nickname,
            User.is_active == True
        ).first()
    else:
        return jsonify({'error': 'Укажите email, nickname или identifier'}), 400

    if not user or not user.check_password(password):
        return jsonify({'error': 'Неверные данные для входа'}), 401

    try:
        user.last_login = datetime.now(timezone.utc)
        db.session.commit()

        access_token, refresh_token = make_tokens(user)

        return jsonify({
            'user': user.to_dict(include_sensitive=True),
            'access_token': access_token,
            'refresh_token': refresh_token
        })
    except Exception as e:
        db.session.rollback()
        print(f'Ошибка входа: {e}')
        return jsonify({'error': 'Ошибка при входе'}), 500


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Обновление токена"""
    try:
        current_user_id = int(get_jwt_identity())
        user = db.session.get(User, current_user_id)

        if not user or not user.is_active:
            return jsonify({'error': 'Пользователь не найден'}), 404

        new_access_token, _ = make_tokens(user)

        return jsonify({
            'access_token': new_access_token,
            'message': 'Токен обновлен'
        })

    except Exception as e:
        print(f'Ошибка обновления токена: {e}')
        return jsonify({'error': 'Ошибка обновления токена'}), 500


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Получить данные текущего пользователя"""
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)

        if not user or not user.is_active:
            return jsonify({'error': 'Пользователь не найден'}), 404

        return jsonify({
            'data': {
                'user': user.to_dict(include_sensitive=True)
            }
        })

    except Exception as e:
        print(f'Ошибка получения пользователя: {e}')
        return jsonify({'error': 'Ошибка получения данных пользователя'}), 500


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Обновление профиля пользователя"""
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)

        if not user or not user.is_active:
            return jsonify({'error': 'Пользователь не найден'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Данные не предоставлены'}), 400

        if 'full_name' in data and data['full_name']:
            user.full_name = data['full_name'].strip()

        if 'nickname' in data and data['nickname']:
            new_nickname = data['nickname'].strip()
            if not validate_nickname(new_nickname):
                return jsonify({'error': 'Nickname должен содержать 3-20 символов (буквы, цифры, точки, подчёркивания, дефисы)'}), 400
            existing = User.query.filter(
                db.func.lower(User.nickname) == new_nickname.lower(),
                User.id != user.id
            ).first()
            if existing:
                return jsonify({'error': 'Этот nickname уже занят'}), 400
            user.nickname = new_nickname

        db.session.commit()

        return jsonify({
            'data': {
                'user': user.to_dict(include_sensitive=True)
            }
        })

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка обновления профиля: {e}')
        return jsonify({'error': 'Ошибка при обновлении профиля'}), 500


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Смена пароля"""
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)

        if not user or not user.is_active:
            return jsonify({'error': 'Пользователь не найден'}), 404

        data = request.get_json()
        if not data or not data.get('current_password') or not data.get('new_password'):
            return jsonify({'error': 'Необходимы текущий и новый пароль'}), 400

        if not user.check_password(data['current_password']):
            return jsonify({'error': 'Неверный текущий пароль'}), 400

        if len(data['new_password']) < 6:
            return jsonify({'error': 'Новый пароль должен содержать минимум 6 символов'}), 400

        user.set_password(data['new_password'])
        db.session.commit()

        return jsonify({'message': 'Пароль успешно изменен'})

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка смены пароля: {e}')
        return jsonify({'error': 'Ошибка при смене пароля'}), 500


@auth_bp.route('/forgot-password', methods=['POST'])
@rate_limit(5, 60)
def forgot_password():
    """Восстановление пароля"""
    data = request.get_json()

    if not data or not data.get('email'):
        return jsonify({'error': 'Email обязателен'}), 400

    user = User.query.filter_by(email=data['email'].lower(), is_active=True).first()

    if not user:
        # Не сообщаем о том, что пользователь не найден (безопасность)
        return jsonify({'message': 'Если пользователь с таким email существует, инструкции отправлены на почту'})

    try:
        import os
        import secrets
        from flask import current_app
        from services.email import send_email, is_configured

        reset_token = secrets.token_urlsafe(32)
        user.reset_token = reset_token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.session.commit()

        link = f"{current_app.config['FRONTEND_URL']}/reset-password?token={reset_token}"
        send_email(
            user.email,
            'Сброс пароля erik',
            f'Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n{link}\n\n'
            f'Если вы не запрашивали сброс — просто игнорируйте это письмо.',
        )

        resp = {'message': 'Если пользователь с таким email существует, инструкции отправлены на почту'}
        # dev (без SMTP и не прод): отдаём токен/ссылку, чтобы флоу был проходим без почты
        if not is_configured() and os.environ.get('FLASK_ENV') != 'production':
            resp['dev_reset_token'] = reset_token
            resp['dev_reset_link'] = link
        return jsonify(resp)

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка восстановления пароля: {e}')
        return jsonify({'error': 'Ошибка при отправке инструкций'}), 500


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Сброс пароля по токену"""
    data = request.get_json()

    if not data or not data.get('token') or not data.get('password'):
        return jsonify({'error': 'Токен и новый пароль обязательны'}), 400

    user = User.query.filter_by(reset_token=data['token']).first()

    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc):
        return jsonify({'error': 'Недействительный или истекший токен'}), 400

    if len(data['password']) < 6:
        return jsonify({'error': 'Пароль должен содержать минимум 6 символов'}), 400

    try:
        user.set_password(data['password'])
        user.reset_token = None
        user.reset_token_expires = None

        db.session.commit()

        return jsonify({'message': 'Пароль успешно изменен'})

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка сброса пароля: {e}')
        return jsonify({'error': 'Ошибка при смене пароля'}), 500


@auth_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """Верификация email"""
    data = request.get_json()

    if not data or not data.get('token'):
        return jsonify({'error': 'Токен верификации обязателен'}), 400

    user = User.query.filter_by(verification_token=data['token']).first()

    if not user:
        return jsonify({'error': 'Недействительный токен верификации'}), 400

    try:
        user.is_verified = True
        user.verification_token = None

        db.session.commit()

        return jsonify({'message': 'Email успешно подтвержден'})

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка верификации email: {e}')
        return jsonify({'error': 'Ошибка при подтверждении email'}), 500


@auth_bp.route('/deactivate', methods=['POST'])
@jwt_required()
def deactivate_account():
    """Деактивация аккаунта"""
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)

        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        data = request.get_json(silent=True) or {}
        # Аккаунт (email/пароль) требует подтверждения паролем; device-личность без пароля
        # деактивируется по валидному JWT (подтверждать нечем).
        if user.has_account:
            if not data.get('password'):
                return jsonify({'error': 'Подтверждение паролем обязательно'}), 400
            if not user.check_password(data['password']):
                return jsonify({'error': 'Неверный пароль'}), 400

        user.is_active = False
        db.session.commit()

        return jsonify({'message': 'Аккаунт деактивирован'})

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка деактивации аккаунта: {e}')
        return jsonify({'error': 'Ошибка при деактивации аккаунта'}), 500


@auth_bp.route('/deactivate', methods=['DELETE'])
@jwt_required()
def delete_account():
    """Удаление аккаунта"""
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)

        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        db.session.delete(user)
        db.session.commit()

        return jsonify({'message': 'Аккаунт удален'})

    except Exception as e:
        db.session.rollback()
        print(f'Ошибка удаления аккаунта: {e}')
        return jsonify({'error': 'Ошибка при удалении аккаунта'}), 500
