from datetime import datetime
import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy.exc import IntegrityError
from models import db, City, Org, OrgApplication, User, Gathering, Notification, RoleRequest


def headers(user):
    return {'Authorization': 'Bearer ' + create_access_token(identity=str(user.id))}


@pytest.fixture
def payload():
    db.session.add(City(id='ast', name_ru='Астана'))
    db.session.commit()
    return {'legalName': 'Общественный фонд «Помощь»', 'legalForm': 'Общественный фонд',
            'bin': '123456789012', 'cityId': 'ast', 'legalAddress': 'Астана, юридический адрес',
            'representativeName': 'Иван Иванов', 'authority': 'Руководитель, действует на основании устава',
            'email': 'private@example.kz', 'phone': '+7 700 123 45 67',
            'publicContact': '@public_help', 'aboutRu': 'Помогаем людям', 'authorityConfirmed': True, 'dataConsent': True}


def decision(client, aid, admin_headers, status='approved'):
    return client.post(f'/api/admin/org-applications/{aid}/decision', headers=admin_headers,
                       json={'decision': status, 'note': 'Проверены сведения eGov и полномочия представителя',
                             'registryChecked': True, 'authorityChecked': True})


def test_submit_approve_atomic_private_data_and_duplicate_decision(client, user1, user2, admin_headers, payload):
    user1.role = 'vol'; db.session.commit()
    res = client.post('/api/orgs', headers=headers(user1), json=payload)
    assert res.status_code == 201
    aid = res.json['application']['id']
    assert Org.query.count() == 0 and user1.role == 'vol'
    assert RoleRequest.query.filter_by(user_id=user1.id).count() == 0
    assert client.get('/api/orgs').json['orgs'] == []
    assert client.get('/api/me/org-applications', headers=headers(user2)).json['applications'] == []
    assert client.get('/api/admin/org-applications', headers=headers(user1)).status_code == 403
    assert decision(client, aid, headers(user1)).status_code == 403
    assert client.get('/api/admin/stats', headers=admin_headers).json['pendingOrgs'] == 1
    assert client.post('/api/admin/org-applications/%s/decision' % aid, headers=admin_headers,
                       json={'decision': 'approved', 'note': 'Без проверки нельзя'}).status_code == 400
    assert Org.query.count() == 0
    approved = decision(client, aid, admin_headers)
    assert approved.status_code == 200
    oid = approved.json['application']['orgId']
    assert db.session.get(User, user1.id).role == 'org'
    assert client.get('/api/me/orgs', headers=headers(user1)).json['orgs'][0]['id'] == oid
    public = client.get('/api/orgs').json['orgs'][0]
    assert public['verified'] is True and public['bin'] == payload['bin']
    assert public['contacts']['general'] == '@public_help'
    for value in ('private@example.kz', 'юридический адрес', 'Иван Иванов', 'полномочия'):
        assert value not in str(public)
    assert decision(client, aid, admin_headers).status_code == 409
    assert decision(client, aid, admin_headers, 'rejected').status_code == 409
    assert Org.query.count() == 1 and Notification.query.filter_by(user_id=user1.id).count() == 1
    assert client.post('/api/orgs', headers=headers(user2), json=payload).status_code == 409
    assert client.get('/api/admin/stats', headers=admin_headers).json['pendingOrgs'] == 0


def test_reject_resubmit_preserves_audit_and_reservations(client, user1, user2, admin_headers, payload):
    first = client.post('/api/orgs', headers=headers(user1), json=payload).json['application']
    assert client.post('/api/orgs', headers=headers(user1), json=payload).status_code == 409
    assert client.post('/api/orgs', headers=headers(user2), json=payload).status_code == 409
    assert client.post('/api/orgs', headers=headers(user1), json={**payload, 'bin': '999999999999'}).status_code == 409
    assert decision(client, first['id'], admin_headers, 'rejected').status_code == 200
    assert Org.query.count() == 0
    second = client.post('/api/orgs', headers=headers(user1), json=payload)
    assert second.status_code == 201 and second.json['application']['id'] != first['id']
    history = client.get('/api/me/org-applications', headers=headers(user1)).json['applications']
    assert [a['status'] for a in history] == ['pending', 'rejected']
    assert history[1]['reason']
    assert decision(client, first['id'], admin_headers).status_code == 409
    assert decision(client, second.json['application']['id'], admin_headers).status_code == 200


@pytest.mark.parametrize('patch', [{'bin': '123'}, {'bin': 123456789012}, {'authorityConfirmed': False},
                                    {'dataConsent': False}, {'email': 'invalid'}, {'cityId': 'bad'}, {'legalName': 'x'*201},
                                    {'legalForm': []}, {'cat': 'missing'}, {'publicContact': ''}])
def test_validation_no_partial_writes(client, user1, payload, patch):
    assert client.post('/api/orgs', headers=headers(user1), json={**payload, **patch}).status_code == 400
    assert OrgApplication.query.count() == Org.query.count() == 0


def test_account_deactivated_before_approval(client, user1, admin_headers, payload):
    aid = client.post('/api/orgs', headers=headers(user1), json=payload).json['application']['id']
    user1.is_active = False; db.session.commit()
    assert decision(client, aid, admin_headers).status_code == 409
    assert Org.query.count() == 0
    assert db.session.get(OrgApplication, aid).status == 'pending'


def test_database_uniqueness_enforces_pending_reservations_and_bin(user1, user2, payload):
    db.session.add(OrgApplication(user_id=user1.id, pending_user_id=user1.id, pending_bin=payload['bin'], data=payload))
    db.session.commit()
    db.session.add(OrgApplication(user_id=user2.id, pending_user_id=user2.id, pending_bin=payload['bin'], data=payload))
    with pytest.raises(IntegrityError): db.session.commit()
    db.session.rollback()
    db.session.add_all([Org(name='One', bin=payload['bin']), Org(name='Two', bin=payload['bin'])])
    with pytest.raises(IntegrityError): db.session.commit()
    db.session.rollback()
    assert Org.query.count() == 0


def test_directory_and_event_history_filter_unpublished(client, user1):
    visible = Org(name='Approved', verified=True, owner_id=user1.id)
    hidden = Org(name='Pending', verified=False)
    db.session.add_all([visible, hidden]); db.session.flush()
    for i, status in enumerate(('open', 'closed', 'pending', 'rejected', 'deleted')):
        db.session.add(Gathering(code='HISTORY'+str(i), title_ru=status, org_id=visible.id,
                                 owner_id=user1.id, status=status, starts_at=datetime(2020, 1, i+1)))
    db.session.commit()
    assert [o['name'] for o in client.get('/api/orgs').json['orgs']] == ['Approved']
    assert len(client.get(f'/api/orgs/{visible.id}/events').json['events']) == 2
    assert client.get(f'/api/orgs/{visible.id}').json['org']['events'] == 2


def test_org_registration_waits_for_full_application(client, legal_acceptance):
    result = client.post('/api/auth/register', json={'identifier': 'orgowner', 'password': 'testpass123',
                        'full_name': 'Представитель НКО', 'role': 'org', 'legal': legal_acceptance})
    assert result.status_code == 201
    assert result.json['user']['role'] == 'vol' and result.json['roleRequest'] is None
    assert Org.query.count() == OrgApplication.query.count() == RoleRequest.query.count() == 0


def test_org_approval_resolves_older_organizer_request(client, user1, admin_headers, payload):
    pending = RoleRequest(user_id=user1.id, requested_role='coord', status='pending')
    db.session.add(pending); db.session.commit()
    aid = client.post('/api/orgs', headers=headers(user1), json=payload).json['application']['id']
    assert decision(client, aid, admin_headers).status_code == 200
    db.session.refresh(pending)
    assert pending.status == 'approved' and pending.decided_by is not None
    assert client.post(f'/api/admin/role-requests/{pending.id}/approve', headers=admin_headers).status_code == 409
    assert db.session.get(User, user1.id).role == 'org'
