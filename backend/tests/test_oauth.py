"""Real OIDC validation and isolated SQL/JWT flows; no external Google requests."""
import base64
import hashlib
import secrets
import time
from urllib.parse import parse_qs, urlsplit

import pytest
from joserfc import jwt
from joserfc.jwk import RSAKey

from models import db, LegalConsent, OAuthIdentity, OAuthLoginCode, User
from services.oauth_service import google_client

BASE = '/api/auth/oauth'


@pytest.fixture
def google(app, monkeypatch):
    for key, value in {'GOOGLE_CLIENT_ID': 'test-client', 'GOOGLE_CLIENT_SECRET': 'test-secret',
                       'GOOGLE_REDIRECT_URI': 'http://localhost/api/auth/oauth/google/callback',
                       'FRONTEND_URL': 'http://localhost:3000'}.items():
        monkeypatch.setitem(app.config, key, value)
    remote = google_client()
    monkeypatch.setattr(remote, 'client_id', 'test-client')
    monkeypatch.setattr(remote, 'client_secret', 'test-secret')
    metadata = {'issuer': 'https://accounts.google.com',
                'authorization_endpoint': 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_endpoint': 'https://oauth2.googleapis.com/token',
                'jwks_uri': 'https://www.googleapis.com/oauth2/v3/certs',
                'id_token_signing_alg_values_supported': ['RS256']}
    monkeypatch.setattr(remote, 'server_metadata', metadata)
    monkeypatch.setattr(remote, 'load_server_metadata', lambda: metadata)
    return remote


def credentials():
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    return verifier, challenge


def handoff(subject='google-123', email='google@example.test', expires=None):
    verifier, challenge = credentials()
    code = secrets.token_urlsafe(32)
    db.session.add(OAuthLoginCode(code_hash=hashlib.sha256(code.encode()).hexdigest(),
        challenge=challenge, subject=subject, email=email, full_name='Google Person',
        expires_at=expires or int(time.time()) + 600))
    db.session.commit()
    return {'code': code, 'verifier': verifier}


def test_disabled_and_invalid_start(client):
    assert client.get(BASE + '/providers').json == {'providers': []}
    assert client.get(BASE + '/google/start').status_code == 503


def test_authorization_uses_state_nonce_pkce_and_cookie(client, google):
    _, challenge = credentials()
    assert client.get(BASE + '/google/start?challenge=bad').status_code == 400
    response = client.get(BASE + '/google/start?challenge=' + challenge)
    query = parse_qs(urlsplit(response.location).query)
    assert query['scope'] == ['openid email profile']
    assert query['code_challenge_method'] == ['S256']
    assert query['state'][0] and query['nonce'][0] and query['code_challenge'][0]
    assert 'HttpOnly' in response.headers['Set-Cookie']
    assert response.headers['Cache-Control'] == 'no-store'


@pytest.mark.parametrize('failure', [None, 'state', 'nonce', 'aud', 'iss', 'exp', 'signature', 'email_verified'])
def test_real_oidc_validation(client, google, monkeypatch, failure):
    _, challenge = credentials()
    start = client.get(BASE + '/google/start?challenge=' + challenge)
    params = parse_qs(urlsplit(start.location).query)
    key = RSAKey.generate_key(2048)
    claims = {'iss': 'https://accounts.google.com', 'aud': 'test-client', 'sub': 'google-123',
              'iat': int(time.time()), 'exp': int(time.time()) + 300,
              'nonce': params['nonce'][0], 'email': 'google@example.test', 'email_verified': True,
              'name': 'Google Person'}
    if failure in ('nonce', 'aud', 'iss'):
        claims[failure] = 'wrong'
    if failure == 'exp':
        claims['exp'] = int(time.time()) - 3600
    if failure == 'email_verified':
        claims['email_verified'] = False
    signed = jwt.encode({'alg': 'RS256', 'kid': 'test'}, claims, key)
    def fetch(**kwargs):
        assert kwargs['code_verifier']
        return {'id_token': signed, 'access_token': 'provider-token', 'token_type': 'Bearer'}
    monkeypatch.setattr(google, 'fetch_access_token', fetch)
    public = (RSAKey.generate_key(2048) if failure == 'signature' else key).as_dict(private=False)
    public['kid'] = 'test'
    monkeypatch.setattr(google, 'fetch_jwk_set', lambda *args, **kwargs: {'keys': [public]})
    state = 'wrong' if failure == 'state' else params['state'][0]
    response = client.get(BASE + '/google/callback?code=provider-code&state=' + state)
    assert response.status_code == 302
    assert urlsplit(response.location).netloc == 'localhost:3000'
    assert 'access_token' not in response.location and 'refresh_token' not in response.location
    result = parse_qs(urlsplit(response.location).fragment)
    assert ('error' in result) == (failure is not None)
    assert OAuthLoginCode.query.count() == (0 if failure else 1)
    assert User.query.count() == 0
    replay = client.get(BASE + '/google/callback?code=provider-code&state=' + state)
    assert 'error=invalid_session' in replay.location


def test_callback_without_browser_cookie_fails(client, google):
    assert 'invalid_session' in client.get(BASE + '/google/callback?code=x&state=x').location


def test_registration_requires_consent_and_consumes_code(client, google, legal_acceptance):
    payload = handoff()
    response = client.post(BASE + '/exchange', json=payload)
    assert response.json['status'] == 'registration_required'
    assert User.query.count() == 0
    assert client.post(BASE + '/exchange', json={**payload, 'full_name': 'Google Person'}).status_code == 400
    assert client.post(BASE + '/exchange', json={**payload, 'full_name': 'Google Person',
        'legal': {**legal_acceptance, 'version': 'old'}}).status_code == 409
    response = client.post(BASE + '/exchange', json={**payload, 'full_name': 'Google Person',
        'legal': legal_acceptance, 'role': 'org', 'user_type': 'admin'})
    assert response.status_code == 200
    user = User.query.one()
    assert user.role == 'vol' and user.user_type == 'user' and user.has_account
    assert not user.password_hash and user.is_verified
    assert LegalConsent.query.one().source == 'oauth.google'
    assert OAuthIdentity.query.one().user_id == user.id
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + response.json['access_token']}).status_code == 200
    assert client.post('/api/auth/refresh', headers={'Authorization': 'Bearer ' + response.json['refresh_token']}).status_code == 200
    assert client.post(BASE + '/exchange', json=payload).status_code == 400


def test_existing_email_needs_password_and_preserves_history(client, google, user1):
    user1.hours_total = 42
    db.session.commit()
    payload = handoff(email=user1.email)
    assert client.post(BASE + '/exchange', json=payload).json['status'] == 'link_required'
    assert client.post(BASE + '/exchange', json={**payload, 'password': 'wrong'}).status_code == 401
    assert OAuthIdentity.query.count() == 0
    response = client.post(BASE + '/exchange', json={**payload, 'password': 'test1234'})
    assert response.status_code == 200
    assert response.json['user']['id'] == user1.id
    assert user1.hours_total == 42 and user1.token_version == 1
    assert user1.check_password('test1234')
    assert LegalConsent.query.count() == 0
    # Identity is stable even if the email reported by Google changes.
    response = client.post(BASE + '/exchange', json=handoff(email='changed@example.test'))
    assert response.json['user']['id'] == user1.id


def test_inactive_account_cannot_login_or_link(client, google, user1):
    user1.is_active = False
    db.session.commit()
    assert client.post(BASE + '/exchange', json=handoff(email=user1.email)).status_code == 403
    db.session.add(OAuthIdentity(provider='google', subject='google-123', user=user1))
    db.session.commit()
    assert client.post(BASE + '/exchange', json=handoff()).status_code == 403


def test_linking_keeps_production_admin_password_restriction(client, google, admin_user, monkeypatch):
    admin_user.set_password('admin123')
    db.session.commit()
    monkeypatch.setenv('FLASK_ENV', 'production')
    response = client.post(BASE + '/exchange', json={**handoff(email=admin_user.email), 'password': 'admin123'})
    assert response.status_code == 401
    assert OAuthIdentity.query.count() == 0


def test_wrong_browser_expired_code_and_json_rejected(client, google):
    payload = handoff()
    assert client.post(BASE + '/exchange', json={**payload, 'verifier': secrets.token_urlsafe(32)}).status_code == 400
    assert client.post(BASE + '/exchange', json=handoff(expires=int(time.time()) - 1)).status_code == 400
    for invalid in ([], None, {'code': 123}, {'code': payload['code'], 'verifier': []}):
        assert client.post(BASE + '/exchange', json=invalid).status_code == 400
    assert User.query.count() == 0


def test_oauth_identity_is_not_a_device_account_and_is_deleted_with_user(client, google):
    user = User(email='oauth@example.test', full_name='OAuth User', device_id='oauth-device')
    db.session.add(OAuthIdentity(provider='google', subject='google-123', user=user))
    db.session.commit()
    assert user.has_account
    assert client.post('/api/session', json={'deviceId': 'oauth-device'}).status_code == 401
    db.session.delete(user)
    db.session.commit()
    assert OAuthIdentity.query.count() == 0
