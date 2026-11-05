import base64
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs

import pytest
from flask_jwt_extended import create_access_token
from models import db, University, UniversityMembership, UniversityMicrosoftState, Gathering, Participant


TENANT = '12345678-1234-1234-1234-123456789abc'
OID = '12345678-1234-1234-1234-123456789def'
CARD = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\nstudent-card').decode()


def headers(user):
    return {'Authorization': 'Bearer ' + create_access_token(identity=str(user.id))}


@pytest.fixture
def university(user1):
    user1.role = 'coord'
    row = University(name='Campus', city='Astana', manager_id=user1.id,
                     microsoft_tenant_id=TENANT, email_domains=['students.example.edu'])
    db.session.add(row)
    db.session.commit()
    return row


def submit(client, university, user, **patch):
    return client.post(f'/api/universities/{university.id}/membership', headers=headers(user), json={
        'fullName': 'Student Full Name', 'phone': '+7 777 123 45 67', 'studentCard': CARD, 'consent': True, **patch})


def test_membership_review_privacy_and_retry(client, university, user1, user2, create_user):
    outsider = create_user(full_name='Other coordinator', role='coord')
    response = submit(client, university, user2)
    assert response.status_code == 201
    membership = response.get_json()['membership']
    assert membership['status'] == 'pending'
    mid = membership['id']
    assert submit(client, university, user2).status_code == 409
    list_url = f'/api/universities/{university.id}/memberships'
    card_url = f'/api/university-memberships/{mid}/student-card'
    assert client.get(list_url, headers=headers(outsider)).status_code == 403
    assert client.get(card_url, headers=headers(outsider)).status_code == 403
    assert client.get(card_url).status_code == 401
    for viewer in (user1, user2):
        photo = client.get(card_url, headers=headers(viewer))
        assert photo.status_code == 200
        assert photo.headers['Cache-Control'] == 'private, no-store'
        assert photo.mimetype == 'image/png'
    public = client.get(f'/api/universities/{university.id}').get_json()['university']
    assert public['membership'] is None and public['managerId'] is None
    assert 'Student Full Name' not in str(public)
    decision_url = f'/api/university-memberships/{mid}/decision'
    assert client.post(decision_url, headers=headers(outsider), json={'status': 'approved'}).status_code == 403
    assert client.post(decision_url, headers=headers(user1), json={'status': 'rejected'}).status_code == 400
    assert client.post(decision_url, headers=headers(user1), json={'status': 'rejected', 'reason': 'Unreadable card'}).status_code == 200
    assert submit(client, university, user2).status_code == 201
    assert UniversityMembership.query.count() == 1
    assert client.post(decision_url, headers=headers(user1), json={'status': 'approved'}).status_code == 200
    assert client.post(decision_url, headers=headers(user1), json={'status': 'rejected', 'reason': 'late'}).status_code == 409
    own = client.get(f'/api/universities/{university.id}', headers=headers(user2)).get_json()['university']
    assert own['membership']['status'] == 'approved'


@pytest.mark.parametrize('patch', [
    {'fullName': 'One'}, {'phone': '123'}, {'phone': 'abcdefghij'}, {'consent': False},
    {'studentCard': 'data:image/png;base64,invalid'},
    {'studentCard': 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg/>').decode()},
    {'fullName': []}, {'phone': []},
])
def test_invalid_membership_rejected(client, university, user2, patch):
    assert submit(client, university, user2, **patch).status_code == 400
    assert UniversityMembership.query.count() == 0


def test_large_card_accepted_under_production_request_limit(client, app, university, user2):
    previous = app.config.get('MAX_CONTENT_LENGTH')
    app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024
    try:
        card = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'x' * (1024 * 1024)).decode()
        assert submit(client, university, user2, studentCard=card).status_code == 201
    finally:
        app.config['MAX_CONTENT_LENGTH'] = previous


def test_all_registration_paths_require_approved_membership(client, university, user1, user2):
    event = Gathering(code='CAMPUS', owner_id=user1.id, title_ru='Campus event', status='open', university_id=university.id)
    db.session.add(event); db.session.commit()
    eid = event.id
    assert client.get('/api/events').get_json()['events'] == []
    assert client.get(f'/api/universities/{university.id}').get_json()['events'][0]['id'] == eid
    submit(client, university, user2)
    for status in ('pending', 'rejected'):
        member = UniversityMembership.query.one(); member.status = status; db.session.commit()
        for method, url, body in [
            ('put', f'/api/events/{eid}/registration', {'answer': 'yes'}),
            ('put', '/api/g/CAMPUS/rsvp', {'answer': 'yes'}),
            ('post', f'/api/events/{eid}/applications', {}),
        ]:
            result = getattr(client, method)(url, headers=headers(user2), json=body)
            assert result.status_code == 403, result.get_json()
            assert result.get_json()['universityId'] == university.id
        assert Participant.query.count() == 0
    member.status = 'approved'; db.session.commit()
    assert client.put(f'/api/events/{eid}/registration', headers=headers(user2), json={'answer': 'yes'}).status_code == 200
    assert client.put('/api/g/CAMPUS/rsvp', headers=headers(user2), json={'answer': 'maybe'}).status_code == 200
    assert Participant.query.count() == 1
    assert client.post(f'/api/events/{eid}/applications', headers=headers(user2), json={}).status_code == 201


def test_only_assigned_manager_can_attach_event(client, university, user1, create_user):
    outsider = create_user(full_name='Other Organizer', role='coord')
    payload = {'what': 'Campus event', 'where': 'Campus', 'universityId': university.id}
    assert client.post('/api/gatherings', headers=headers(outsider), json=payload).status_code == 403
    result = client.post('/api/gatherings', headers=headers(user1), json=payload)
    assert result.status_code == 201
    assert result.get_json()['gathering']['universityId'] == university.id
    assert result.get_json()['gathering']['status'] == 'pending'


def test_admin_catalog_settings(client, university, user1, admin_headers):
    payload = {'name': 'New Campus', 'city': 'Almaty', 'managerId': user1.id,
               'microsoftTenantId': TENANT, 'emailDomains': ['students.example.edu']}
    assert client.post('/api/universities', headers=headers(user1), json=payload).status_code == 403
    assert client.post('/api/universities', headers=admin_headers, json={**payload, 'microsoftTenantId': 'bad'}).status_code == 400
    result = client.post('/api/universities', headers=admin_headers, json=payload)
    assert result.status_code == 201
    uid = result.get_json()['university']['id']
    assert client.post('/api/universities', headers=admin_headers, json=payload).status_code == 409
    assert client.put(f'/api/universities/{uid}', headers=admin_headers, json={**payload, 'name': 'Updated'}).status_code == 200


def test_demoted_manager_loses_private_membership_access(client, university, user1, user2):
    submit(client, university, user2)
    mid = UniversityMembership.query.one().id
    user1.role = 'vol'
    db.session.commit()
    assert client.get(f'/api/universities/{university.id}/memberships', headers=headers(user1)).status_code == 403
    assert client.get(f'/api/university-memberships/{mid}/student-card', headers=headers(user1)).status_code == 403


@pytest.fixture
def microsoft_config(app, monkeypatch):
    for key, value in {'MICROSOFT_CLIENT_ID': 'client-id', 'MICROSOFT_CLIENT_SECRET': 'test-secret',
        'MICROSOFT_REDIRECT_URI': 'https://api.example.test/api/universities/microsoft/callback',
        'FRONTEND_URL': 'https://erik.example.test'}.items():
        monkeypatch.setitem(app.config, key, value)


def start(client, university, user):
    result = client.post(f'/api/universities/{university.id}/microsoft/start', headers=headers(user))
    assert result.status_code == 200
    url = result.get_json()['authorizationUrl']
    assert url.startswith(f'https://login.microsoftonline.com/{TENANT}/')
    query = parse_qs(urlparse(url).query)
    assert query['code_challenge_method'] == ['S256']
    assert len(query['code_challenge'][0]) == 43
    return query['state'][0]


def test_microsoft_disabled_without_configuration(client, university, user2):
    assert not client.get(f'/api/universities/{university.id}').get_json()['university']['microsoftEnabled']
    assert client.post(f'/api/universities/{university.id}/microsoft/start', headers=headers(user2)).status_code == 409


def test_microsoft_callback_approves_once_and_prevents_duplicate_identity(client, university, user2, user1, microsoft_config, monkeypatch):
    monkeypatch.setattr('routes.university_microsoft._verify_account', lambda *args: (OID, 'student@students.example.edu'))
    state = start(client, university, user2)
    url = f'/api/universities/microsoft/callback?state={state}&code=test'
    result = client.get(url)
    assert result.status_code == 302 and result.location.endswith('?microsoft=success')
    row = UniversityMembership.query.one()
    assert row.status == 'approved' and row.verification_method == 'microsoft' and row.student_card is None
    assert client.get(url).status_code == 400
    state = start(client, university, user1)
    assert client.get(f'/api/universities/microsoft/callback?state={state}&code=test').location.endswith('?microsoft=linked')
    assert UniversityMembership.query.count() == 1


def test_microsoft_expired_or_wrong_account_does_not_grant_access(client, university, user2, microsoft_config, monkeypatch):
    state = start(client, university, user2)
    UniversityMicrosoftState.query.one().expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.session.commit()
    assert client.get(f'/api/universities/microsoft/callback?state={state}&code=test').location.endswith('?microsoft=expired')
    def fail(*_):
        raise ValueError('wrong tenant, domain or guest')
    monkeypatch.setattr('routes.university_microsoft._verify_account', fail)
    state = start(client, university, user2)
    assert client.get(f'/api/universities/microsoft/callback?state={state}&code=test').location.endswith('?microsoft=failed')
    assert UniversityMembership.query.count() == 0


@pytest.mark.parametrize('change', ['domain', 'guest', 'oid', 'nonce', 'tenant', 'signature'])
def test_microsoft_verification_checks_identity_boundaries(university, microsoft_config, monkeypatch, change):
    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    from types import SimpleNamespace
    from routes.university_microsoft import _verify_account
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    claims = {'iss': f'https://login.microsoftonline.com/{TENANT}/v2.0', 'tid': TENANT,
              'aud': 'client-id', 'oid': OID, 'nonce': 'nonce', 'iat': now, 'exp': now + timedelta(minutes=5)}
    if change in ('nonce', 'tenant'):
        claims['nonce' if change == 'nonce' else 'tid'] = 'wrong'
    token = jwt.encode(claims, key, algorithm='RS256')
    verify_key = rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key() if change == 'signature' else key.public_key()
    monkeypatch.setattr(jwt.PyJWKClient, 'get_signing_key_from_jwt', lambda *_: SimpleNamespace(key=verify_key))
    profile = {'id': OID, 'userPrincipalName': 'student@students.example.edu', 'userType': 'Member'}
    if change == 'domain': profile['userPrincipalName'] = 'student@elsewhere.edu'
    if change == 'guest': profile['userType'] = 'Guest'
    if change == 'oid': profile['id'] = 'different'
    monkeypatch.setattr('routes.university_microsoft._json_request', lambda url, **_: profile if 'graph.microsoft' in url else {'id_token': token, 'access_token': 'token'})
    with pytest.raises((ValueError, jwt.PyJWTError)):
        _verify_account(university, 'code', SimpleNamespace(verifier='verifier', nonce='nonce'))
