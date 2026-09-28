from flask_jwt_extended import create_access_token
from models import db, User


def headers(token):
    return {'Authorization': 'Bearer ' + token}


def test_known_device_cannot_unlock_password_account(client, admin_user):
    admin_user.device_id = 'known-device'
    db.session.commit()
    assert client.post('/api/session', json={'deviceId': 'known-device'}).status_code == 401


def test_guest_resume_requires_own_token(client, user1):
    guest = client.post('/api/session', json={'deviceId': 'guest-device'}).json
    assert client.post('/api/session', json={'deviceId': 'guest-device'}).status_code == 401
    wrong = create_access_token(identity=str(user1.id))
    assert client.post('/api/session', json={'deviceId': 'guest-device'}, headers=headers(wrong)).status_code == 403
    assert client.post('/api/session', json={'deviceId': 'guest-device'}, headers=headers(guest['token'])).status_code == 200


def test_device_upgrade_without_proof_is_refused(client, legal_acceptance):
    client.post('/api/session', json={'deviceId': 'guest-device'})
    result = client.post('/api/auth/register', headers={'X-Device-Id': 'guest-device'}, json={
        'nickname': 'attacker', 'password': 'long-password', 'full_name': 'Test Person', 'legal': legal_acceptance})
    assert result.status_code == 401
    assert User.query.one().password_hash is None


def test_logout_revokes_access_and_refresh(client, user1):
    login = client.post('/api/auth/login', json={'email': user1.email, 'password': 'test1234'}).json
    assert client.post('/api/logout', headers=headers(login['access_token'])).status_code == 204
    assert client.get('/api/me', headers=headers(login['access_token'])).status_code == 401
    assert client.post('/api/auth/refresh', headers=headers(login['refresh_token'])).status_code == 401


def test_refresh_is_single_use(client, user1):
    login = client.post('/api/auth/login', json={'email': user1.email, 'password': 'test1234'}).json
    refreshed = client.post('/api/auth/refresh', headers=headers(login['refresh_token']))
    assert refreshed.status_code == 200
    assert client.post('/api/auth/refresh', headers=headers(login['refresh_token'])).status_code == 401
    assert client.post('/api/auth/refresh', headers=headers(refreshed.json['refresh_token'])).status_code == 200


def test_password_change_revokes_both_tokens(client, user1):
    login = client.post('/api/auth/login', json={'email': user1.email, 'password': 'test1234'}).json
    assert client.post('/api/auth/change-password', headers=headers(login['access_token']), json={
        'current_password': 'test1234', 'new_password': 'new-password'}).status_code == 200
    assert client.get('/api/me', headers=headers(login['access_token'])).status_code == 401
    assert client.post('/api/auth/refresh', headers=headers(login['refresh_token'])).status_code == 401


def test_demo_disabled_by_default(client, app, monkeypatch):
    monkeypatch.setitem(app.config, 'ALLOW_DEMO_LOGIN', False)
    assert client.post('/api/session', json={'deviceId': 'demo-admin'}).status_code == 403


def test_known_compose_secrets_are_rejected(monkeypatch):
    import pytest
    from config import validate_config
    for key, value in dict(FLASK_ENV='production', SECRET_KEY='super-secret-key-change-me',
                           JWT_SECRET_KEY='jwt-secret-key-change-me', DATABASE_URL='sqlite://',
                           REDIS_URL='redis://localhost').items():
        monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError):
        validate_config()


def test_feed_is_bounded_and_pages_are_disjoint(client, user1):
    from models import Gathering
    db.session.add_all([Gathering(owner_id=user1.id, code=f'PAGE{i}', status='open') for i in range(55)])
    db.session.commit()
    first = client.get('/api/events').json
    second = client.get('/api/events?offset=50').json
    assert first['total'] == second['total'] == 55
    assert len(first['events']) == 50
    assert len(second['events']) == 5
    assert not ({e['id'] for e in first['events']} & {e['id'] for e in second['events']})


def test_reference_seed_never_creates_demo_accounts():
    from seed import seed_catalogs
    from models import City, Theme, Gathering
    seed_catalogs()
    seed_catalogs()
    assert City.query.count() > 0 and Theme.query.count() > 0
    assert User.query.count() == Gathering.query.count() == 0


def test_known_seeded_admin_password_is_refused_in_production(client, admin_user, monkeypatch):
    admin_user.set_password('admin123')
    db.session.commit()
    monkeypatch.setenv('FLASK_ENV', 'production')
    assert client.post('/api/auth/login', json={'email': admin_user.email, 'password': 'admin123'}).status_code == 401
