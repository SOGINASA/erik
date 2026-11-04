import base64
from flask_jwt_extended import create_access_token
from models import db, Gathering, GatheringRole, Participant, Org


def headers(user):
    return {'Authorization': 'Bearer ' + create_access_token(identity=str(user.id))}


def event(owner):
    row = Gathering(code='COMMUNITY', owner_id=owner.id, title_ru='Помощь', status='open', needed=2)
    db.session.add(row)
    db.session.commit()
    return row


def test_multiple_roles_atomic_capacity_and_cancellation(client, user1, user2):
    g = event(user1)
    roles = [GatheringRole(gathering_id=g.id, title_ru=t, title_kz=t, capacity=1) for t in ['Фото', 'Помощь']]
    db.session.add_all(roles)
    db.session.commit()
    ids = [r.id for r in roles]
    url = f'/api/events/{g.id}/registration'
    assert client.put(url, headers=headers(user1), json={'answer': 'yes', 'roleIds': ids}).status_code == 200
    r = client.put(url, headers=headers(user2), json={'answer': 'yes', 'roleIds': ids})
    assert r.status_code == 409
    assert Participant.query.filter_by(user_id=user2.id).first() is None
    detail = client.get(f'/api/events/{g.id}', headers=headers(user1)).get_json()['event']
    assert detail['myRoleIds'] == ids
    assert [r['taken'] for r in detail['roles']] == [1, 1]
    assert client.put(url, headers=headers(user1), json={'answer': 'no'}).status_code == 200
    assert client.put(url, headers=headers(user2), json={'answer': 'yes', 'roleIds': ids}).status_code == 200


def test_confirmation_idempotent_and_cleared_on_maybe(client, user1, user2):
    g = event(user1)
    url = f'/api/events/{g.id}'
    h = headers(user2)
    assert client.post(url + '/confirm', headers=h).status_code == 400
    client.put(url + '/registration', headers=h, json={'answer': 'yes'})
    for _ in range(2):
        r = client.post(url + '/confirm', headers=h)
        assert r.status_code == 200
        assert r.get_json()['remainingNeeded'] == 1
        assert r.get_json()['confirmedCount'] == 1
    client.put(url + '/registration', headers=h, json={'answer': 'maybe'})
    assert client.get(url, headers=h).get_json()['event']['confirmedCount'] == 0
    client.put(url + '/registration', headers=h, json={'answer': 'yes'})
    assert client.get(url + '/registration', headers=h).get_json()['confirmed'] is False


def test_org_profile_permissions_validation_reviews(client, user1, user2):
    h = headers(user1)
    data = {'name': 'НКО', 'contacts': {'telegram': '@help', 'phone': '+77770000000'},
            'officeAddress': 'Астана, 1', 'mapUrl': 'https://2gis.kz/astana',
            'coordinators': [{'name': 'Анна', 'contact': '@anna'}], 'photos': ['https://example.org/photo.jpg']}
    r = client.post('/api/orgs', headers=h, json=data)
    assert r.status_code == 201
    org = r.get_json()['org']
    url = f"/api/orgs/{org['id']}"
    assert org['contacts'] == data['contacts']
    assert org['coordinators'] == data['coordinators']
    assert client.patch(url, headers=headers(user2), json=data).status_code == 403
    assert client.patch(url, headers=h, json={'mapUrl': 'javascript:alert(1)'}).status_code == 400
    assert client.post(url + '/reviews', headers=h, json={'rating': 5, 'text': 'Отзыв'}).status_code == 403
    assert client.post(url + '/reviews', headers=headers(user2), json={'rating': 6, 'text': 'Отзыв'}).status_code == 400
    for rating in (4, 5):
        assert client.post(url + '/reviews', headers=headers(user2), json={'rating': rating, 'text': 'Спасибо'}).status_code == 200
    reviews = client.get(url + '/reviews').get_json()['reviews']
    assert len(reviews) == 1 and reviews[0]['rating'] == 5


def test_upload_image_roundtrip_and_reject_svg(client, user1):
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=')
    r = client.post('/api/uploads/images', headers=headers(user1), json={'data': base64.b64encode(png).decode()})
    assert r.status_code == 201
    image = client.get(r.get_json()['url'])
    assert image.data == png and image.content_type == 'image/png'
    assert image.headers['X-Content-Type-Options'] == 'nosniff'
    assert client.post('/api/uploads/images', headers=headers(user1), json={'data': base64.b64encode(b'<svg/>').decode()}).status_code == 400


def test_community_migration_preserves_existing_data(tmp_path):
    from pathlib import Path
    from flask import Flask
    from flask_migrate import Migrate, upgrade, downgrade
    from sqlalchemy import inspect, text
    app = Flask('community-migration')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + str(tmp_path / 'community.db')
    db.init_app(app)
    directory = str(Path(__file__).resolve().parents[1] / 'migrations')
    Migrate(app, db, directory=directory)
    with app.app_context():
        upgrade(directory=directory, revision='d0e1f2a3b4c5')
        db.session.execute(text("INSERT INTO users (id, full_name) VALUES (1, 'Existing User')"))
        db.session.execute(text("INSERT INTO orgs (id, name, owner_id) VALUES (1, 'Existing Org', 1)"))
        db.session.commit()
        upgrade(directory=directory)
        assert 'confirmed_at' in {c['name'] for c in inspect(db.engine).get_columns('participants')}
        assert db.session.execute(text('SELECT name FROM orgs WHERE id=1')).scalar_one() == 'Existing Org'
        db.session.remove()
        downgrade(directory=directory, revision='d0e1f2a3b4c5')
        upgrade(directory=directory)
        assert inspect(db.engine).has_table('uploaded_images')
