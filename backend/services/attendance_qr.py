"""Short-lived, purpose-bound invitations to confirm one's own attendance."""
from datetime import datetime, timedelta, timezone

from flask import current_app
from itsdangerous import URLSafeTimedSerializer

QR_TTL_SECONDS = 300


def serializer():
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'], salt='attendance-qr-v1')


def issue_qr(gathering):
    signer = serializer()
    token = signer.dumps({'id': gathering.id, 'code': gathering.code})
    _, issued_at = signer.loads(token, return_timestamp=True)
    expires_at = issued_at + timedelta(seconds=QR_TTL_SECONDS)
    return {
        'token': token, 'expiresAt': expires_at.isoformat(),
        'expiresIn': max(0, (expires_at - datetime.now(timezone.utc)).total_seconds()),
    }


def verify_qr(token, gathering):
    payload = serializer().loads(token, max_age=QR_TTL_SECONDS - 1)
    return isinstance(payload, dict) and payload == {'id': gathering.id, 'code': gathering.code}
