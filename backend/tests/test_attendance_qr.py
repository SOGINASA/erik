import pytest
from flask_jwt_extended import create_access_token
from itsdangerous import TimestampSigner

from models import db, Gathering, GatheringCoordinator, Participant, AttendanceRecord
from services.forecast import finalize_gathering


@pytest.fixture
def event(user1, user2):
    gathering = Gathering(code='QRTEST', owner_id=user1.id, title_ru='Уборка парка', status='open')
    db.session.add(gathering)
    db.session.flush()
    db.session.add(Participant(gathering_id=gathering.id, user_id=user2.id, name=user2.full_name, answer='yes'))
    db.session.commit()
    return gathering


def headers(user):
    return {'Authorization': f'Bearer {create_access_token(identity=str(user.id))}'}


def issue(client, event, user):
    return client.post(f'/api/gatherings/{event.id}/checkin/qr', headers=headers(user))


def submit(client, event, user, token, action='confirm', **extra):
    return client.post(f'/api/gatherings/{event.id}/checkin/{action}',
                       headers=headers(user), json={'token': token, **extra})


def test_preview_confirm_retry_and_finalization(client, event, user1, user2):
    response = issue(client, event, user1)
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'no-store'
    token = response.json['token']
    part = Participant.query.filter_by(gathering_id=event.id, user_id=user2.id).one()
    preview = submit(client, event, user2, token, 'preview')
    assert preview.status_code == 200
    assert preview.json['title'] == 'Уборка парка'
    assert part.presence is None
    first = submit(client, event, user2, token)
    assert first.status_code == 200
    assert first.json['presence'] == 'came'
    assert first.json['alreadyPresent'] is False
    again = submit(client, event, user2, token)
    assert again.json['alreadyPresent'] is True
    assert again.json['revision'] == first.json['revision']
    assert again.json['checkedInAt'] == first.json['checkedInAt']
    assert part.confirmed_at is None
    finalize_gathering(event)
    record = AttendanceRecord.query.filter_by(gathering_id=event.id, user_id=user2.id).one()
    assert record.presence == 'came'
    assert record.hours_credited > 0
    assert submit(client, event, user2, token).status_code == 409


def test_only_owner_and_coordinator_can_issue(client, event, user1, user2):
    assert client.post(f'/api/gatherings/{event.id}/checkin/qr').status_code == 401
    assert issue(client, event, user2).status_code == 403
    db.session.add(GatheringCoordinator(gathering_id=event.id, user_id=user2.id, role='cocoord'))
    db.session.commit()
    assert issue(client, event, user2).status_code == 200


def test_token_expires_at_five_minutes_and_new_token_works(client, event, user1, user2, monkeypatch):
    clock = [1800000000]
    monkeypatch.setattr(TimestampSigner, 'get_timestamp', lambda self: clock[0])
    old = issue(client, event, user1).json['token']
    clock[0] += 299
    assert submit(client, event, user2, old, 'preview').status_code == 200
    clock[0] += 1
    expired = submit(client, event, user2, old)
    assert expired.status_code == 410
    assert expired.json['code'] == 'expired_qr'
    new = issue(client, event, user1).json['token']
    assert new != old
    assert submit(client, event, user2, new).status_code == 200


@pytest.mark.parametrize('status', ['pending', 'done', 'rejected', 'deleted'])
def test_closed_event_rejects_issuance_and_confirmation(client, event, user1, user2, status):
    token = issue(client, event, user1).json['token']
    event.status = status
    db.session.commit()
    expected = 404 if status == 'deleted' else 409
    assert issue(client, event, user1).status_code == expected
    assert submit(client, event, user2, token).status_code == expected


@pytest.mark.parametrize('body', [None, [], 'token', {}, {'token': False}, {'token': {}}, {'token': ''}, {'token': 'x' * 1025}, {'token': 'forged'}])
def test_malformed_tokens_do_not_change_attendance(client, event, user2, body):
    response = client.post(f'/api/gatherings/{event.id}/checkin/confirm', headers=headers(user2), json=body)
    assert response.status_code == 400
    assert Participant.query.filter_by(gathering_id=event.id, user_id=user2.id).one().presence is None


def test_other_event_and_tampering_rejected(client, event, user1, user2):
    token = issue(client, event, user1).json['token']
    other = Gathering(code='OTHERQR', owner_id=user1.id, status='open')
    db.session.add(other)
    db.session.commit()
    assert submit(client, other, user2, token).status_code == 400
    assert submit(client, event, user2, 'x' + token).status_code == 400


def test_only_self_and_registered_active_users(client, event, user1, user2, create_user):
    token = issue(client, event, user1).json['token']
    assert client.post(f'/api/gatherings/{event.id}/checkin/confirm', json={'token': token}).status_code == 401
    outsider = create_user(email='outsider@test.com')
    assert submit(client, event, outsider, token, userId=user2.id).status_code == 403
    assert submit(client, event, user2, token, userId=user1.id).status_code == 200
    assert Participant.query.filter_by(gathering_id=event.id, user_id=user1.id).first() is None
    user2.is_active = False
    db.session.commit()
    assert submit(client, event, user2, token).status_code in (401, 403)


@pytest.mark.parametrize('answer, expected', [('no', 403), (None, 403), ('maybe', 200)])
def test_registration_state(client, event, user1, user2, answer, expected):
    token = issue(client, event, user1).json['token']
    part = Participant.query.filter_by(gathering_id=event.id, user_id=user2.id).one()
    part.answer = answer
    db.session.commit()
    assert submit(client, event, user2, token).status_code == expected
