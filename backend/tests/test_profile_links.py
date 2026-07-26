"""Временная проверка: новые id доезжают до API (профиль, ростер, заявки)."""
from datetime import datetime, timedelta

from models import db, User, Gathering, Participant, AttendanceRecord, Application


def _mk(owner_id, title='Субботник'):
    g = Gathering(title_ru=title, title_kz=title, owner_id=owner_id,
                  starts_at=datetime.utcnow() + timedelta(days=1), needed=5, code='PARK18')
    db.session.add(g)
    db.session.commit()
    return g


def test_user_public_history_has_gathering_id(client, user1, user2):
    g = _mk(user2.id)
    db.session.add(AttendanceRecord(user_id=user1.id, gathering_id=g.id, presence='came'))
    db.session.commit()

    r = client.get(f'/api/users/{user1.id}')
    assert r.status_code == 200
    hist = r.get_json()['user']['history']
    assert hist and hist[0]['id'] == g.id


def test_roster_participant_has_user_id(client, user1, user2, auth_headers):
    g = _mk(user1.id)
    db.session.add(Participant(gathering_id=g.id, user_id=user2.id, name='User Two', answer='yes'))
    db.session.add(Participant(gathering_id=g.id, user_id=None, name='Гость', answer='yes', is_guest=True))
    db.session.commit()

    r = client.get(f'/api/gatherings/{g.id}', headers=auth_headers)
    assert r.status_code == 200
    parts = r.get_json()['gathering']['participants']
    by_name = {p['name']: p for p in parts}
    assert by_name['User Two']['userId'] == user2.id
    assert by_name['Гость']['userId'] is None


def test_application_has_applicant_user_id(client, user1, user2, auth_headers):
    g = _mk(user1.id)
    db.session.add(Application(gathering_id=g.id, applicant_id=user2.id, name='User Two', status='pending'))
    db.session.commit()

    r = client.get('/api/me/org/applications', headers=auth_headers)
    assert r.status_code == 200
    apps = r.get_json()['applications']
    assert apps and apps[0]['userId'] == user2.id
