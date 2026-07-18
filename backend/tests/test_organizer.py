"""P3: заявки на событие (Application) + штаб организатора + admin-дополнения."""
from datetime import datetime, timezone

import pytest
from flask_jwt_extended import create_access_token

from models import (db, User, City, Gathering, GatheringCoordinator, Participant,
                    Application, CharityRequest, Notification)


def _tok(u):
    return create_access_token(identity=str(u.id), additional_claims={
        'user_type': u.user_type, 'role': u.role, 'full_name': u.full_name})


def _h(u):
    return {'Authorization': 'Bearer ' + _tok(u), 'Content-Type': 'application/json'}


@pytest.fixture
def scenario():
    """Организатор + сбор + волонтёр + благотворительная кампания."""
    db.session.add(City(id='ast', name_ru='Астана', name_kz='Астана', map_x=1, map_y=1))
    owner = User(full_name='Организатор', role='coord', user_type='user', is_active=True, device_id='d-own')
    vol = User(full_name='Волонтёр Асан', role='vol', user_type='user', is_active=True,
               device_id='d-vol', city_id='ast', phone='+7 700 000 00 00',
               reliability=88, trust_came=5, trust_total=6, hours_total=40, events_attended=9,
               skills=['org', 'photo'])
    admin = User(full_name='Админ', role='coord', user_type='admin', is_active=True, email='a@a.kz')
    db.session.add_all([owner, vol, admin])
    db.session.commit()
    g = Gathering(code='PARK18', owner_id=owner.id, title_ru='Уборка парка', title_kz='Саябақ',
                  place_ru='Парк', place_kz='Саябақ', theme='eco', city_id='ast',
                  starts_at=datetime(2026, 7, 25, 10, tzinfo=timezone.utc), needed=20, status='open')
    db.session.add(g)
    db.session.commit()
    db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=owner.id, role='owner'))
    ch = CharityRequest(title_ru='Инвентарь', kind='money', goal=100000, raised=40000, city_id='ast')
    db.session.add(ch)
    db.session.commit()
    return {'owner': owner, 'vol': vol, 'admin': admin, 'gid': g.id, 'chid': ch.id}


# ── заявки ──
def test_create_application(client, scenario):
    r = client.post(f'/api/events/{scenario["gid"]}/applications', headers=_h(scenario['vol']),
                    json={'skills': ['org', 'photo', 'BOGUS'], 'message': 'Помогу'})
    assert r.status_code == 201
    a = r.get_json()['application']
    assert a['skills'] == ['org', 'photo']          # неизвестный ключ отфильтрован
    assert a['eventId'] == scenario['gid']
    assert a['reliability'] == 88
    assert a['history'] == {'came': 5, 'total': 6}
    assert a['messageRu'] == 'Помогу' and a['messageKz'] == 'Помогу'


def test_create_application_idempotent(client, scenario):
    url = f'/api/events/{scenario["gid"]}/applications'
    client.post(url, headers=_h(scenario['vol']), json={'skills': ['org'], 'message': 'v1'})
    r = client.post(url, headers=_h(scenario['vol']), json={'skills': ['heavy'], 'message': 'v2'})
    assert r.status_code == 200                      # без дублей
    assert Application.query.filter_by(gathering_id=scenario['gid']).count() == 1


def test_application_missing_event_404(client, scenario):
    r = client.post('/api/events/9999/applications', headers=_h(scenario['vol']), json={})
    assert r.status_code == 404


# ── штаб организатора ──
def test_org_events(client, scenario):
    client.post(f'/api/events/{scenario["gid"]}/applications', headers=_h(scenario['vol']),
                json={'skills': ['org'], 'message': 'x'})
    r = client.get('/api/me/org/events', headers=_h(scenario['owner']))
    assert r.status_code == 200
    ev = r.get_json()['events']
    assert len(ev) == 1
    assert ev[0]['applied'] == 1
    assert ev[0]['status'] in ('live', 'soon', 'done')
    assert ev[0]['dateISO'] == '2026-07-25'


def test_org_applications_owner_only(client, scenario):
    client.post(f'/api/events/{scenario["gid"]}/applications', headers=_h(scenario['vol']),
                json={'skills': ['org'], 'message': 'x'})
    r = client.get('/api/me/org/applications', headers=_h(scenario['owner']))
    assert len(r.get_json()['applications']) == 1
    assert r.get_json()['applications'][0]['phone'] == '+7 700 000 00 00'   # PII организатору
    # не-владелец не видит чужих заявок
    r2 = client.get('/api/me/org/applications', headers=_h(scenario['vol']))
    assert r2.get_json()['applications'] == []


# ── accept → Participant ──
def test_accept_creates_participant(client, scenario):
    r = client.post(f'/api/events/{scenario["gid"]}/applications', headers=_h(scenario['vol']),
                    json={'skills': ['org'], 'message': 'x'})
    aid = r.get_json()['application']['id']
    r = client.post(f'/api/applications/{aid}/accept', headers=_h(scenario['owner']))
    assert r.status_code == 200 and r.get_json()['application']['status'] == 'accepted'
    p = Participant.query.filter_by(gathering_id=scenario['gid'], user_id=scenario['vol'].id).first()
    assert p is not None and p.answer == 'yes'


def test_decline(client, scenario):
    r = client.post(f'/api/events/{scenario["gid"]}/applications', headers=_h(scenario['vol']),
                    json={'skills': ['org'], 'message': 'x'})
    aid = r.get_json()['application']['id']
    r = client.post(f'/api/applications/{aid}/decline', headers=_h(scenario['owner']))
    assert r.get_json()['application']['status'] == 'declined'
    assert Participant.query.filter_by(gathering_id=scenario['gid'], user_id=scenario['vol'].id).first() is None


def test_non_owner_cannot_act(client, scenario):
    r = client.post(f'/api/events/{scenario["gid"]}/applications', headers=_h(scenario['vol']),
                    json={'skills': ['org'], 'message': 'x'})
    aid = r.get_json()['application']['id']
    assert client.post(f'/api/applications/{aid}/accept', headers=_h(scenario['vol'])).status_code == 403


# ── admin-дополнения ──
def test_admin_stats_enriched(client, scenario):
    r = client.get('/api/admin/stats', headers=_h(scenario['admin']))
    st = r.get_json()
    assert r.status_code == 200
    assert {'volunteers', 'raised', 'activeEvents', 'verifiedOrgs'} <= set(st)
    assert st['raised'] == 40000


def test_admin_analytics(client, scenario):
    r = client.get('/api/admin/analytics', headers=_h(scenario['admin']))
    an = r.get_json()
    assert r.status_code == 200
    assert {'attendanceRate', 'byCity', 'byTheme', 'growth'} <= set(an)


def test_admin_broadcast_segment(client, scenario):
    r = client.post('/api/admin/broadcast', headers=_h(scenario['admin']),
                    json={'segment': 'vol', 'title': 'Привет', 'textRu': 'Субботник'})
    assert r.status_code == 200 and r.get_json()['reach'] == 1
    n = Notification.query.filter_by(user_id=scenario['vol'].id, type='system').first()
    assert n is not None and 'Привет' in (n.text_ru or '')


def test_admin_events_and_unpublish(client, scenario):
    r = client.get('/api/admin/events', headers=_h(scenario['admin']))
    assert len(r.get_json()['events']) == 1
    r = client.post(f'/api/admin/events/{scenario["gid"]}/unpublish', headers=_h(scenario['admin']))
    assert r.status_code == 200
    assert db.session.get(Gathering, scenario['gid']).status == 'deleted'


def test_admin_charity_close(client, scenario):
    r = client.post(f'/api/admin/charity/{scenario["chid"]}/close', headers=_h(scenario['admin']))
    cl = r.get_json()
    assert r.status_code == 200 and cl['raised'] == cl['goal']


def test_admin_endpoints_require_admin(client, scenario):
    assert client.get('/api/admin/analytics', headers=_h(scenario['vol'])).status_code == 403
    assert client.post('/api/admin/broadcast', headers=_h(scenario['vol']), json={}).status_code == 403
