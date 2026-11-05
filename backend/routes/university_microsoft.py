"""Link an existing erik profile to a tenant-approved Microsoft university account.

No Microsoft tokens are persisted or sent to the browser. Tenant and domain must
both be explicitly configured by an administrator; consumer/guest accounts fail.
"""
import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError

import jwt
from flask import current_app, request, jsonify, g, redirect
from sqlalchemy.exc import IntegrityError

from models import db, University, UniversityMembership, UniversityMicrosoftState, User
from routes.universities import universities_bp
from utils.decorators import profiled_required, rate_limit


def _configured(university):
    config = current_app.config
    return bool(university and university.microsoft_tenant_id and university.email_domains and
                config.get('MICROSOFT_CLIENT_ID') and config.get('MICROSOFT_CLIENT_SECRET') and
                config.get('MICROSOFT_REDIRECT_URI'))


def _json_request(url, data=None, headers=None):
    req = Request(url, data=data, headers=headers or {})
    with urlopen(req, timeout=15) as response:
        return json.loads(response.read(1024 * 1024))


def _verify_account(university, code, state):
    tenant = university.microsoft_tenant_id
    config = current_app.config
    token = _json_request(f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
        data=urlencode({'client_id': config['MICROSOFT_CLIENT_ID'],
            'client_secret': config['MICROSOFT_CLIENT_SECRET'], 'code': code,
            'grant_type': 'authorization_code', 'redirect_uri': config['MICROSOFT_REDIRECT_URI'],
            'code_verifier': state.verifier}).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'})
    id_token = token['id_token']
    jwks = jwt.PyJWKClient(f'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys', timeout=15)
    claims = jwt.decode(id_token, jwks.get_signing_key_from_jwt(id_token).key,
        algorithms=['RS256'], audience=config['MICROSOFT_CLIENT_ID'],
        issuer=f'https://login.microsoftonline.com/{tenant}/v2.0',
        options={'require': ['exp', 'iat', 'iss', 'aud', 'nonce', 'tid', 'oid']})
    if claims['tid'] != tenant or not hmac.compare_digest(claims['nonce'], state.nonce):
        raise ValueError('Invalid Microsoft identity')
    profile = _json_request('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName,userType',
        headers={'Authorization': 'Bearer ' + token['access_token']})
    email = profile.get('userPrincipalName', '').lower()
    # A suffix in an unverified ID-token username alone is not an authorization boundary.
    if (profile.get('id') != claims['oid'] or profile.get('userType') != 'Member' or
            '@' not in email or email.rsplit('@', 1)[1] not in university.email_domains):
        raise ValueError('Account does not belong to the university')
    return claims['oid'], email


@universities_bp.post('/universities/<int:id>/microsoft/start')
@profiled_required
@rate_limit(15, 3600, by_user=True)
def microsoft_start(id):
    university = db.session.get(University, id)
    if not _configured(university):
        return jsonify({'error': 'Вход Microsoft для этого университета ещё не настроен'}), 409
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    UniversityMicrosoftState.query.filter(UniversityMicrosoftState.expires_at < now).delete()
    raw_state = secrets.token_urlsafe(32)
    state = UniversityMicrosoftState(id=hashlib.sha256(raw_state.encode()).hexdigest(),
        user_id=g.user.id, university_id=id, nonce=secrets.token_urlsafe(32),
        verifier=secrets.token_urlsafe(64), expires_at=now + timedelta(minutes=10))
    db.session.add(state)
    db.session.commit()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(state.verifier.encode()).digest()).rstrip(b'=').decode()
    query = urlencode({'client_id': current_app.config['MICROSOFT_CLIENT_ID'],
        'response_type': 'code', 'response_mode': 'query',
        'redirect_uri': current_app.config['MICROSOFT_REDIRECT_URI'],
        'scope': 'openid profile email https://graph.microsoft.com/User.Read',
        'state': raw_state, 'nonce': state.nonce, 'code_challenge': challenge,
        'code_challenge_method': 'S256', 'prompt': 'select_account'})
    return jsonify({'authorizationUrl': f'https://login.microsoftonline.com/{university.microsoft_tenant_id}/oauth2/v2.0/authorize?{query}'})


@universities_bp.get('/universities/microsoft/callback')
def microsoft_callback():
    raw_state = request.args.get('state', '')
    state_id = hashlib.sha256(raw_state.encode()).hexdigest()
    state = db.session.get(UniversityMicrosoftState, state_id)
    if state is None:
        return jsonify({'error': 'Ссылка входа недействительна или уже использована'}), 400
    university_id, user_id = state.university_id, state.user_id
    db.session.expunge(state)
    # Atomic one-time consumption, also across multiple workers.
    removed = UniversityMicrosoftState.query.filter_by(id=state_id).delete(synchronize_session=False)
    db.session.commit()
    target = current_app.config.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/') + f'/universities/{university_id}'
    if removed != 1 or state.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        return redirect(target + '?microsoft=expired')
    university, user = db.session.get(University, university_id), db.session.get(User, user_id)
    if not _configured(university) or not user or not user.is_active or request.args.get('error') or not request.args.get('code'):
        return redirect(target + '?microsoft=failed')
    try:
        oid, email = _verify_account(university, request.args['code'], state)
        User.query.filter_by(id=user_id).with_for_update().one()
        duplicate = UniversityMembership.query.filter_by(university_id=university_id, microsoft_oid=oid).first()
        if duplicate and duplicate.user_id != user_id:
            return redirect(target + '?microsoft=linked')
        row = UniversityMembership.query.filter_by(university_id=university_id, user_id=user_id).first()
        if row is None:
            row = UniversityMembership(university_id=university_id, user_id=user_id)
            db.session.add(row)
        row.full_name, row.phone = user.full_name, user.phone or ''
        row.status, row.verification_method = 'approved', 'microsoft'
        row.microsoft_oid, row.verified_email = oid, email
        row.student_card, row.student_card_mime = None, None
        row.rejection_reason, row.decided_by = None, None
        row.decided_at = datetime.now(timezone.utc)
        db.session.commit()
    except (ValueError, KeyError, TypeError, URLError, TimeoutError, jwt.PyJWTError, IntegrityError):
        db.session.rollback()
        return redirect(target + '?microsoft=failed')
    return redirect(target + '?microsoft=success')
