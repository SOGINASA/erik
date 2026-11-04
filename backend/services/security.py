"""Persistent JWT invalidation and single-use refresh tokens."""
import os
from flask import jsonify, current_app
from sqlalchemy import update
from models import db, User


def configure_jwt(jwt):
    @jwt.additional_claims_loader
    def claims(identity):
        user = db.session.get(User, int(identity))
        return {'ver': user.token_version if user else -1}

    @jwt.token_in_blocklist_loader
    def revoked(_header, payload):
        try:
            user = db.session.get(User, int(payload['sub']))
        except (ValueError, TypeError, KeyError):
            return True
        demo = user is not None and (user.device_id or '').startswith('demo-')
        demo_blocked = demo and (not current_app.testing or os.environ.get('FLASK_ENV') == 'production')
        return user is None or not user.is_active or demo_blocked or payload.get('ver') != user.token_version

    @jwt.revoked_token_loader
    def revoked_response(_header, _payload):
        return jsonify({'error': 'Сессия завершена. Войдите снова.'}), 401


def revoke_user(user):
    # Atomic increment also works when different workers revoke concurrently.
    db.session.execute(update(User).where(User.id == user.id).values(
        token_version=User.token_version + 1))
    db.session.flush()

