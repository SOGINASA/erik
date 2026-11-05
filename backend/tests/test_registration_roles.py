"""Регистрация сохраняет выбранную роль в заявке, одобрение даёт права организатора."""
import pytest

from models import db, City, Gathering, GatheringCoordinator, Org, Theme, User


@pytest.mark.parametrize('role', ['vol', 'coord', 'org'])
def test_registration_profile_login_and_event_creation(client, legal_acceptance, admin_headers, role):
    db.session.add(City(id='ast', name_ru='Астана'))
    db.session.add(Theme(id='eco', label_ru='Экология'))
    db.session.commit()
    registration = client.post('/api/auth/register', json={
        'identifier': 'role_test', 'password': 'password123',
        'full_name': 'Иван Тестовый', 'role': role, 'cityId': 'ast',
        'legal': legal_acceptance,
    })
    assert registration.status_code == 201
    account = registration.get_json()
    user_id = account['user']['id']
    assert account['user']['role'] == 'vol'
    assert db.session.get(User, user_id).role == 'vol'
    headers = {'Authorization': 'Bearer ' + account['access_token']}
    profile = client.get('/api/users/me', headers=headers).get_json()['user']
    assert profile['role'] == 'vol'
    if role in ('vol', 'org'):
        assert profile['roleRequest'] is None
        assert account['roleRequest'] is None
    else:
        assert account['roleRequest']['role'] == role
        assert profile['roleRequest']['role'] == role
        assert profile['roleRequest']['status'] == 'pending'
        assert client.post('/api/gatherings', headers=headers, json={'what': 'До одобрения'}).status_code == 403
        assert client.post(
            f"/api/admin/role-requests/{account['roleRequest']['id']}/approve",
            headers=admin_headers).status_code == 200

    org_id = None
    if role == 'org':
        applied = client.post('/api/orgs', headers=headers, json={
            'legalName': 'Тестовая НКО', 'legalForm': 'Общественный фонд', 'bin': '123456789012',
            'cityId': 'ast', 'legalAddress': 'Астана, улица 1', 'aboutRu': 'Помощь людям',
            'representativeName': 'Иван Тестовый', 'authority': 'Руководитель по уставу',
            'email': 'representative@example.kz', 'phone': '+77001234567', 'publicContact': '@help',
            'authorityConfirmed': True, 'dataConsent': True,
        })
        assert applied.status_code == 201
        approved = client.post(f"/api/admin/org-applications/{applied.json['application']['id']}/decision",
            headers=admin_headers, json={'decision': 'approved', 'note': 'Сведения и полномочия проверены',
                                        'registryChecked': True, 'authorityChecked': True})
        assert approved.status_code == 200
        org_id = approved.json['application']['orgId']

    # После одобрения работают и прежний токен, и повторный вход.
    for index in range(2):
        if index:
            login = client.post('/api/auth/login', json={
                'identifier': 'role_test', 'password': 'password123',
            })
            assert login.status_code == 200
            account = login.get_json()
            assert account['user']['role'] == role
        headers = {'Authorization': 'Bearer ' + account['access_token']}
        for path in ('/api/me', '/api/users/me'):
            profile = client.get(path, headers=headers)
            assert profile.status_code == 200
            assert profile.get_json()['user']['role'] == role

        response = client.post('/api/gatherings', headers=headers, json={
            'what': f'Субботник {index}', 'where': 'Парк',
            'date': '2027-01-01', 'time': '10:00', 'needed': 20,
            'theme': 'eco', 'cityId': 'ast', 'orgId': org_id,
        })
        if role == 'vol':
            assert response.status_code == 403
            assert Gathering.query.count() == 0
            continue

        assert response.status_code == 201
        body = response.get_json()
        assert body['role'] == role
        assert body['gathering']['status'] == 'pending'
        gathering = db.session.get(Gathering, body['id'])
        assert gathering.owner_id == user_id and gathering.org_id == org_id
        assert GatheringCoordinator.query.filter_by(
            gathering_id=gathering.id, user_id=user_id, role='owner').count() == 1
        mine = client.get('/api/gatherings/mine', headers=headers)
        assert mine.status_code == 200
        assert body['id'] in [item['id'] for item in mine.get_json()['gatherings']]
