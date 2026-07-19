"""Тесты доработок round-2: жалобы, диалоги, un-RSVP, self-reg НКО, push,
событийные уведомления, апгрейд device→аккаунт, device-деактивация, PII device_id."""
from datetime import datetime, timezone

import pytest
from flask_jwt_extended import create_access_token

from models import (db, User, City, Org, Gathering, GatheringCoordinator, Participant,
                    Notification, Report, Conversation, PushSubscription)


def _tok(u):
    return create_access_token(identity=str(u.id), additional_claims={
        'user_type': u.user_type, 'role': u.role, 'full_name': u.full_name})


def _h(u):
    return {'Authorization': 'Bearer ' + _tok(u), 'Content-Type': 'application/json'}


@pytest.fixture
def sc():
    db.session.add(City(id='ast', name_ru='Астана', name_kz='Астана', map_x=1, map_y=1))
    owner = User(full_name='Организатор', role='coord', user_type='user', is_active=True, device_id='d-own')
    vol = User(full_name='Волонтёр', role='vol', user_type='user', is_active=True,
               device_id='d-vol', city_id='ast', phone='+7 700 000 00 00',
               trust_came=5, trust_total=6, reliability=88, hours_total=40, events_attended=9)
    admin = User(full_name='Админ', role='coord', user_type='admin', is_active=True, email='a@a.kz', device_id='d-adm')
    db.session.add_all([owner, vol, admin])
    db.session.commit()
    g = Gathering(code='PARK18', owner_id=owner.id, title_ru='Уборка', title_kz='Тазалау',
                  place_ru='Парк', place_kz='Саябақ', theme='eco', city_id='ast',
                  starts_at=datetime(2026, 7, 25, 10, tzinfo=timezone.utc), needed=20, status='open')
    db.session.add(g)
    db.session.commit()
    db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=owner.id, role='owner'))
    db.session.commit()
    return {'owner': owner, 'vol': vol, 'admin': admin, 'gid': g.id, 'code': g.code}


# ── A14 жалобы ──
def test_submit_report_and_aggregate(client, sc):
    r = client.post('/api/reports', headers=_h(sc['vol']),
                    json={'targetType': 'event', 'targetId': sc['gid'], 'reason': 'спам'})
    assert r.status_code == 201 and r.get_json()['report']['count'] == 1
    r2 = client.post('/api/reports', headers=_h(sc['owner']),
                     json={'targetType': 'event', 'targetId': sc['gid'], 'reason': 'ещё'})
    assert r2.status_code == 200 and r2.get_json()['report']['count'] == 2   # агрегируется
    assert Report.query.count() == 1


def test_report_invalid_type(client, sc):
    assert client.post('/api/reports', headers=_h(sc['vol']),
                       json={'targetType': 'x', 'targetId': 1, 'reason': 'a'}).status_code == 400


# ── A3 диалоги ──
def test_create_conversation_idempotent(client, sc):
    r = client.post('/api/conversations', headers=_h(sc['vol']), json={'peerUserId': sc['owner'].id})
    assert r.status_code == 201
    cid = r.get_json()['conversation']['id']
    r2 = client.post('/api/conversations', headers=_h(sc['vol']), json={'peerUserId': sc['owner'].id})
    assert r2.status_code == 200 and r2.get_json()['conversation']['id'] == cid   # тот же диалог
    assert Conversation.query.count() == 1


def test_create_conversation_self_and_missing(client, sc):
    assert client.post('/api/conversations', headers=_h(sc['vol']), json={'peerUserId': sc['vol'].id}).status_code == 400
    assert client.post('/api/conversations', headers=_h(sc['vol']), json={}).status_code == 400


# ── A21 un-RSVP ──
def test_unregister_event(client, sc):
    client.put(f'/api/events/{sc["gid"]}/registration', headers=_h(sc['vol']), json={'answer': 'yes'})
    assert Participant.query.filter_by(gathering_id=sc['gid'], user_id=sc['vol'].id).first() is not None
    r = client.delete(f'/api/events/{sc["gid"]}/registration', headers=_h(sc['vol']))
    assert r.status_code == 204
    assert Participant.query.filter_by(gathering_id=sc['gid'], user_id=sc['vol'].id).first() is None


# ── A25 self-reg НКО ──
def test_create_org(client, sc):
    r = client.post('/api/orgs', headers=_h(sc['vol']), json={'name': 'Новая НКО', 'cityId': 'ast'})
    assert r.status_code == 201
    org = r.get_json()['org']
    assert org['verified'] is False and org['name'] == 'Новая НКО'
    assert db.session.get(User, sc['vol'].id).role == 'org'


# ── A20 push ──
def test_push_subscribe_idempotent(client, sc):
    body = {'endpoint': 'https://push.example/abc', 'keys': {'p256dh': 'k', 'auth': 'a'}}
    assert client.post('/api/push/subscribe', headers=_h(sc['vol']), json=body).status_code == 201
    client.post('/api/push/subscribe', headers=_h(sc['vol']), json=body)
    assert PushSubscription.query.filter_by(user_id=sc['vol'].id).count() == 1


# ── A5 событийные уведомления ──
def test_rsvp_notifies_owner(client, sc):
    client.put(f'/api/g/{sc["code"]}/rsvp', headers=_h(sc['vol']), json={'answer': 'yes'})
    n = Notification.query.filter_by(user_id=sc['owner'].id, type='answer').first()
    assert n is not None


def test_accept_notifies_applicant(client, sc):
    r = client.post(f'/api/events/{sc["gid"]}/applications', headers=_h(sc['vol']),
                    json={'skills': ['org'], 'message': 'x'})
    aid = r.get_json()['application']['id']
    client.post(f'/api/applications/{aid}/accept', headers=_h(sc['owner']))
    assert Notification.query.filter_by(user_id=sc['vol'].id, type='event').first() is not None


# ── A22 device-деактивация без пароля ──
def test_device_user_deactivate_no_password(client, sc):
    r = client.post('/api/auth/deactivate', headers=_h(sc['vol']), json={})
    assert r.status_code == 200
    assert db.session.get(User, sc['vol'].id).is_active is False


# ── A19 апгрейд device → аккаунт ──
def test_register_upgrades_device_user(client, sc):
    before = User.query.count()
    r = client.post('/api/auth/register',
                    headers={'X-Device-Id': 'd-vol', 'Content-Type': 'application/json'},
                    json={'email': 'vol@erik.kz', 'password': 'secret123'})
    assert r.status_code == 201
    assert User.query.count() == before               # не создан новый пользователь
    upgraded = db.session.get(User, sc['vol'].id)
    assert upgraded.email == 'vol@erik.kz' and upgraded.has_account
    assert upgraded.trust_came == 5 and upgraded.hours_total == 40   # trust/история сохранены


# ── реальная метрика «ср. время реакции» + размеры сегментов ──
def test_admin_stats_reaction_and_segments(client, sc):
    # без закрытых жалоб — avgReactionHours = null
    st0 = client.get('/api/admin/stats', headers=_h(sc['admin'])).get_json()
    assert 'avgReactionHours' in st0 and st0['avgReactionHours'] is None
    assert 'nkoUsers' in st0
    # подать и закрыть жалобу → метрика становится числом
    r = client.post('/api/reports', headers=_h(sc['vol']),
                    json={'targetType': 'event', 'targetId': sc['gid'], 'reason': 'x'})
    rid = r.get_json()['report']['id']
    client.post(f'/api/admin/reports/{rid}/resolve', headers=_h(sc['admin']))
    st1 = client.get('/api/admin/stats', headers=_h(sc['admin'])).get_json()
    assert isinstance(st1['avgReactionHours'], (int, float)) and st1['avgReactionHours'] >= 0
    assert Report.query.get(rid).resolved_at is not None


# ── A12 device_id не утекает в admin-список, но виден в своём /me ──
def test_device_id_not_leaked_in_admin(client, sc):
    r = client.get('/api/admin/users', headers=_h(sc['admin']))
    assert r.status_code == 200
    assert all('device_id' not in u for u in r.get_json()['users'])
    me = client.get('/api/me', headers=_h(sc['vol']))
    assert 'device_id' in me.get_json()['user']       # своё устройство — можно
