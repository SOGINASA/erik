"""Retired money/item collections cannot be read or mutated, even by old clients."""
import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from models import db, Gathering, LegacyCharityRequest, LegacyDonation, Org, User


@pytest.fixture
def archive():
    user = User(full_name='Архивный участник', role='vol', is_active=True)
    admin = User(full_name='Администратор', user_type='admin', is_active=True)
    org = Org(name='Архивная НКО')
    db.session.add_all([user, admin, org])
    db.session.flush()
    campaign = LegacyCharityRequest(title_ru='Исторический сбор', org_id=org.id,
                                   kind='money', goal=100000, raised=40000)
    db.session.add(campaign)
    db.session.flush()
    donation = LegacyDonation(charity_id=campaign.id, user_id=user.id, amount=40000)
    db.session.add(donation)
    db.session.commit()
    return {'user': user, 'admin': admin, 'org': org, 'campaign': campaign, 'donation': donation}


def _headers(user):
    return {'Authorization': 'Bearer ' + create_access_token(identity=str(user.id))}


@pytest.mark.parametrize('method,path', [
    ('GET', '/api/charity'),
    ('GET', '/api/charity/'),
    ('POST', '/api/charity'),
    ('GET', '/api/charity/1'),
    ('POST', '/api/charity/1/donate'),
    ('POST', '/api/charity/1/participate'),
    ('PATCH', '/api/charity/1'),
    ('DELETE', '/api/charity/1'),
    ('GET', '/api/admin/charity'),
    ('POST', '/api/admin/charity/1/close'),
])
@pytest.mark.parametrize('actor', ['anonymous', 'user', 'admin', 'invalid-token'])
def test_retired_endpoints_do_not_read_or_mutate_archive(client, archive, method, path, actor):
    headers = {} if actor == 'anonymous' else (
        {'Authorization': 'Bearer malformed'} if actor == 'invalid-token' else _headers(archive[actor]))
    queries = []

    def capture(_connection, _cursor, statement, _parameters, _context, _executemany):
        queries.append(statement.lower())

    event.listen(db.engine, 'before_cursor_execute', capture)
    try:
        response = client.open(path, method=method, headers=headers,
                               json={'title': 'Новый сбор', 'goal': 50000, 'amount': 50000, 'quantity': 3})
    finally:
        event.remove(db.engine, 'before_cursor_execute', capture)

    assert response.status_code == 410
    assert response.get_json()['code'] == 'charity_retired'
    assert not any('charity_requests' in query or 'donations' in query for query in queries)
    assert LegacyCharityRequest.query.count() == 1
    assert LegacyDonation.query.count() == 1
    assert LegacyCharityRequest.query.one().raised == 40000
    assert LegacyDonation.query.one().amount == 40000


def test_admin_stats_do_not_load_archived_collection_totals(client, archive):
    queries = []

    def capture(_connection, _cursor, statement, _parameters, _context, _executemany):
        queries.append(statement.lower())

    headers = _headers(archive['admin'])
    event.listen(db.engine, 'before_cursor_execute', capture)
    try:
        response = client.get('/api/admin/stats', headers=headers)
    finally:
        event.remove(db.engine, 'before_cursor_execute', capture)
    assert response.status_code == 200
    assert 'raised' not in response.get_json()
    assert not any('charity_requests' in query or 'donations' in query for query in queries)


def test_org_rejection_preserves_archived_campaign_and_donation(client, archive):
    response = client.post(f'/api/admin/orgs/{archive["org"].id}/reject', headers=_headers(archive['admin']))
    assert response.status_code == 200
    db.session.expire_all()
    assert LegacyCharityRequest.query.one().org_id is None
    assert LegacyCharityRequest.query.one().raised == 40000
    assert LegacyDonation.query.one().amount == 40000
    assert Org.query.count() == 0


def test_seed_keeps_events_and_never_recreates_retired_collections(client):
    from seed import seed_demo

    seed_demo()
    assert Gathering.query.count() > 0
    assert LegacyCharityRequest.query.count() == LegacyDonation.query.count() == 0
    response = client.get('/api/events')
    assert response.status_code == 200
    assert response.get_json()['events']
    assert client.get('/api/g/PARK18').status_code == 200


def test_seed_reset_preserves_archive_and_detaches_removed_entities():
    from seed import seed_demo

    seed_demo()
    org = Org.query.first()
    demo_user = User.query.filter_by(device_id='demo-coord').one()
    campaign = LegacyCharityRequest(title_ru='Архив', org_id=org.id, kind='items', goal=20, raised=5)
    db.session.add(campaign)
    db.session.flush()
    donation = LegacyDonation(charity_id=campaign.id, user_id=demo_user.id, amount=5)
    db.session.add(donation)
    db.session.commit()
    campaign_id, donation_id = campaign.id, donation.id

    seed_demo(reset=True)
    db.session.expire_all()
    saved_campaign = db.session.get(LegacyCharityRequest, campaign_id)
    saved_donation = db.session.get(LegacyDonation, donation_id)
    assert saved_campaign.title_ru == 'Архив' and saved_campaign.raised == 5
    assert saved_campaign.org_id is None
    assert saved_donation.amount == 5 and saved_donation.user_id is None
    assert saved_donation.charity_id == campaign_id
    assert Gathering.query.filter_by(code='PARK18').one() is not None
