"""Заявка волонтёра на роль организатора — единственный путь vol → coord.

Раньше роль повышалась молча при создании первого сбора; теперь сбор волонтёру создать
нельзя, а роль выдаёт админ по заявке. Проверяем обе стороны и границу между ними:
заявитель роль себе не выдаёт, админ выдаёт ровно ту, что в заявке.
"""
import pytest
from flask_jwt_extended import create_access_token

from models import db, Notification, RoleRequest


def _headers(user):
    return {'Authorization': f'Bearer {create_access_token(identity=str(user.id))}',
            'Content-Type': 'application/json'}


# ── подача ──

def test_volunteer_submits_request(client, user1):
    r = client.post('/api/me/role-request', headers=_headers(user1),
                    json={'message': 'Хочу проводить субботники'})
    assert r.status_code == 201
    body = r.get_json()['request']
    assert body['status'] == 'pending' and body['role'] == 'coord'
    assert body['name'] == 'User One'
    # Заявка сама по себе роль не выдаёт — это делает только админ.
    db.session.refresh(user1)
    assert user1.role == 'vol'


def test_second_submit_returns_the_same_request(client, user1):
    """Повторный тап по кнопке — не новая заявка: очередь админа не должна дублиться."""
    first = client.post('/api/me/role-request', headers=_headers(user1), json={}).get_json()
    again = client.post('/api/me/role-request', headers=_headers(user1), json={})
    assert again.status_code == 200
    assert again.get_json()['request']['id'] == first['request']['id']
    assert RoleRequest.query.count() == 1


def test_organizer_has_nothing_to_ask_for(client, user1):
    user1.role = 'coord'
    db.session.commit()
    r = client.post('/api/me/role-request', headers=_headers(user1), json={})
    assert r.status_code == 409
    assert r.get_json()['errorKz']


def test_requested_role_is_validated(client, user1):
    """Мусор (или 'vol', или 'admin') в role → дефолтный 'coord', а не что попало в БД."""
    for bad in ('admin', 'vol', 'ceo', None):
        RoleRequest.query.delete()
        db.session.commit()
        r = client.post('/api/me/role-request', headers=_headers(user1), json={'role': bad})
        assert r.get_json()['request']['role'] == 'coord'


def test_my_request_reads_back_the_latest(client, user1):
    assert client.get('/api/me/role-request',
                      headers=_headers(user1)).get_json()['request'] is None
    client.post('/api/me/role-request', headers=_headers(user1), json={'message': 'раз'})
    got = client.get('/api/me/role-request', headers=_headers(user1)).get_json()['request']
    assert got['message'] == 'раз' and got['status'] == 'pending'


# ── решение админа ──

@pytest.fixture
def pending_request(client, user1):
    return client.post('/api/me/role-request', headers=_headers(user1),
                       json={'message': 'Готова вести сборы'}).get_json()['request']


def test_admin_sees_the_queue(client, admin_headers, pending_request):
    rows = client.get('/api/admin/role-requests', headers=admin_headers).get_json()['requests']
    assert [x['id'] for x in rows] == [pending_request['id']]
    # агрегаты заявителя — админ решает по человеку, а не по тексту
    assert 'reliability' in rows[0] and 'events' in rows[0]
    # телефона заявка не даёт
    assert 'phone' not in rows[0]


def test_approve_grants_the_role_and_notifies(client, admin_headers, pending_request, user1):
    r = client.post(f"/api/admin/role-requests/{pending_request['id']}/approve",
                    headers=admin_headers)
    assert r.status_code == 200
    assert r.get_json()['request']['status'] == 'approved'
    db.session.refresh(user1)
    assert user1.role == 'coord'
    assert Notification.query.filter_by(user_id=user1.id).count() == 1
    # и теперь сбор создаётся
    assert client.post('/api/gatherings', headers=_headers(user1), json={
        'what': 'Субботник', 'where': 'Парк', 'date': '2026-08-01', 'time': '10:00',
    }).status_code == 201


def test_reject_keeps_the_role_and_carries_the_reason(client, admin_headers, pending_request, user1):
    r = client.post(f"/api/admin/role-requests/{pending_request['id']}/reject",
                    headers=admin_headers, json={'reason': 'Нет истории участия'})
    assert r.status_code == 200
    assert r.get_json()['request']['rejectReason'] == 'Нет истории участия'
    db.session.refresh(user1)
    assert user1.role == 'vol'
    note = Notification.query.filter_by(user_id=user1.id).first()
    assert 'Нет истории участия' in note.text_ru


def test_declined_applicant_can_apply_again(client, admin_headers, pending_request, user1):
    client.post(f"/api/admin/role-requests/{pending_request['id']}/reject",
                headers=admin_headers, json={})
    r = client.post('/api/me/role-request', headers=_headers(user1), json={'message': 'два'})
    assert r.status_code == 201                      # новая заявка, а не та же
    assert r.get_json()['request']['id'] != pending_request['id']
    assert RoleRequest.query.count() == 2            # отклонённая осталась в истории


def test_decided_request_is_not_decided_twice(client, admin_headers, pending_request):
    """Второй клик не должен переписывать автора и время решения по уже выданной роли."""
    url = f"/api/admin/role-requests/{pending_request['id']}"
    assert client.post(f'{url}/approve', headers=admin_headers).status_code == 200
    assert client.post(f'{url}/reject', headers=admin_headers, json={}).status_code == 409
    assert client.post(f'{url}/approve', headers=admin_headers).status_code == 409


def test_queue_is_admin_only(client, user1, pending_request):
    """Заявитель не должен ни видеть очередь, ни выдавать роль сам себе."""
    assert client.get('/api/admin/role-requests', headers=_headers(user1)).status_code == 403
    assert client.post(f"/api/admin/role-requests/{pending_request['id']}/approve",
                       headers=_headers(user1)).status_code == 403
    db.session.refresh(user1)
    assert user1.role == 'vol'


def test_stats_count_pending_requests(client, admin_headers, pending_request):
    assert client.get('/api/admin/stats',
                      headers=admin_headers).get_json()['pendingRoleRequests'] == 1
