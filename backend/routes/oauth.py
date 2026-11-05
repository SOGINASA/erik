"""Google login: OIDC callback -> browser-bound code -> existing Erik JWT pair."""
import base64
import hashlib
import os
import re
import secrets
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

from flask import Blueprint, current_app, jsonify, redirect, request, session
from sqlalchemy.exc import IntegrityError

from models import db, OAuthIdentity, OAuthLoginCode, User
from routes.auth import make_tokens, validate_email
from services.legal import record_legal_consent, validate_legal_acceptance, validate_subject_name
from services.oauth_service import google_client, google_enabled
from services.security import revoke_user
from utils.decorators import rate_limit

oauth_bp = Blueprint('oauth', __name__)


@oauth_bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


def frontend_result(**params):
    # Fixed trusted destination; never accept a callback host from the request.
    return redirect(current_app.config['FRONTEND_URL'].rstrip('/') + '/oauth/callback#' + urlencode(params))


@oauth_bp.get('/providers')
def providers():
    return jsonify({'providers': ['google'] if google_enabled() else []})


@oauth_bp.get('/google/start')
@rate_limit(15, 60)
def google_start():
    if not google_enabled():
        return jsonify({'error': 'Вход через Google пока не настроен.'}), 503
    challenge = request.args.get('challenge', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', challenge):
        return jsonify({'error': 'Некорректный запрос входа.'}), 400
    # A top-level navigation sets a first-party HttpOnly/Lax cookie, including
    # when the frontend and API have different domains. One pending flow/browser.
    session.clear()
    session['oauth_challenge'] = challenge
    session['oauth_started'] = int(time.time())
    try:
        return google_client().authorize_redirect(current_app.config['GOOGLE_REDIRECT_URI'])
    except Exception as exc:
        session.clear()
        current_app.logger.warning('Google authorization unavailable (%s)', type(exc).__name__)
        return frontend_result(error='provider_unavailable')


@oauth_bp.get('/google/callback')
@rate_limit(30, 60)
def google_callback():
    if not google_enabled():
        return jsonify({'error': 'Вход через Google пока не настроен.'}), 503
    challenge = session.pop('oauth_challenge', None)
    started = session.pop('oauth_started', 0)
    if not challenge or not isinstance(started, int) or not 0 <= time.time() - started <= 600:
        session.clear()
        return frontend_result(error='invalid_session')
    try:
        # Authlib validates state, nonce, issuer, audience, signature and expiry.
        token = google_client().authorize_access_token()
        info = token.get('userinfo') or {}
        subject, email = info.get('sub'), info.get('email')
        if (not isinstance(subject, str) or not 1 <= len(subject) <= 255
                or not isinstance(email, str) or len(email) > 120
                or not validate_email(email) or info.get('email_verified') is not True):
            return frontend_result(error='unverified_email')
        code = secrets.token_urlsafe(32)
        OAuthLoginCode.query.filter(OAuthLoginCode.expires_at < int(time.time())).delete()
        db.session.add(OAuthLoginCode(
            code_hash=hashlib.sha256(code.encode()).hexdigest(), challenge=challenge,
            subject=subject, email=email.lower(), full_name=str(info.get('name') or '')[:100],
            expires_at=int(time.time()) + 600))
        db.session.commit()
        return frontend_result(code=code)
    except Exception as exc:
        db.session.rollback()
        current_app.logger.warning('Google callback rejected (%s)', type(exc).__name__)
        return frontend_result(error='authorization_failed')
    finally:
        session.clear()


@oauth_bp.post('/exchange')
@rate_limit(15, 60)
def exchange():
    if not google_enabled():
        return jsonify({'error': 'Вход через Google пока не настроен.'}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Ожидается JSON-объект.'}), 400
    code, verifier = data.get('code'), data.get('verifier')
    if (not isinstance(code, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', code)
            or not isinstance(verifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43,128}', verifier)):
        return jsonify({'error': 'Начните вход через Google заново.'}), 400
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    pending = db.session.get(OAuthLoginCode, code_hash)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    if (pending is None or pending.expires_at <= time.time()
            or not secrets.compare_digest(challenge, pending.challenge)):
        return jsonify({'error': 'Вход истёк или открыт в другой вкладке. Начните заново.'}), 400

    identity = OAuthIdentity.query.filter_by(provider='google', subject=pending.subject).first()
    user = identity.user if identity else User.query.filter(db.func.lower(User.email) == pending.email).first()
    if user is not None and not user.is_active:
        return jsonify({'error': 'Вход в этот аккаунт недоступен.'}), 403
    snapshot = None
    linking = user is not None and identity is None
    if linking:
        # Email is not an identity key. Existing account ownership must be proven.
        if not user.password_hash or any(item.provider == 'google' for item in user.oauth_identities):
            return jsonify({'error': 'Войдите прежним способом. Привязка этого аккаунта недоступна.'}), 409
        password = data.get('password')
        if password is None:
            return jsonify({'status': 'link_required', 'email': pending.email})
        if not isinstance(password, str) or len(password) > 1024 or not user.check_password(password):
            return jsonify({'error': 'Неверный пароль существующего аккаунта.'}), 401
        # Keep the existing password-login production restriction on admin seeds.
        if os.environ.get('FLASK_ENV') == 'production' and user.user_type == 'admin' and password == 'admin123':
            return jsonify({'error': 'Неверный пароль существующего аккаунта.'}), 401
    elif user is None:
        if 'legal' not in data and 'full_name' not in data:
            return jsonify({'status': 'registration_required', 'email': pending.email, 'full_name': pending.full_name})
        snapshot, error = validate_legal_acceptance(data)
        if error:
            return error
        error = validate_subject_name(data.get('full_name'))
        if error:
            return error

    try:
        # Conditional DELETE is atomic on SQLite/PostgreSQL. Only one request can
        # consume this code; mutations and consumption commit in one transaction.
        consumed = OAuthLoginCode.query.filter_by(code_hash=code_hash).filter(
            OAuthLoginCode.expires_at > int(time.time())).delete(synchronize_session=False)
        if consumed != 1:
            db.session.rollback()
            return jsonify({'error': 'Код входа уже использован. Начните заново.'}), 400
        if user is None:
            user = User(email=pending.email, full_name=data['full_name'].strip(),
                        user_type='user', role='vol', is_active=True, is_verified=True)
            db.session.add(user)
        if identity is None:
            db.session.add(OAuthIdentity(provider='google', subject=pending.subject, user=user))
        if linking:
            revoke_user(user)
            user.is_verified = True
            user.verification_token = None
        if snapshot:
            record_legal_consent(user, snapshot, 'oauth.google')
        user.last_login = datetime.now(timezone.utc)
        db.session.flush()
        access, refresh = make_tokens(user)
        result = {'user': user.to_dict(include_sensitive=True), 'access_token': access, 'refresh_token': refresh}
        db.session.commit()
        return jsonify(result)
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Аккаунт изменился во время входа. Повторите вход через Google.'}), 409
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error('OAuth exchange failed (%s)', type(exc).__name__)
        return jsonify({'error': 'Не удалось завершить вход. Попробуйте позже.'}), 500
