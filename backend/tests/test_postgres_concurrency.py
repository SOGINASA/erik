"""Run with TEST_POSTGRES_URL against a disposable PostgreSQL test database."""
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
from threading import Barrier
from uuid import uuid4

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from flask_migrate import Migrate, upgrade
import pytest
from sqlalchemy import create_engine, text

from models import db, User, Gathering, GatheringRole, Participant
from services.security import configure_jwt


@pytest.mark.skipif(not os.environ.get('TEST_POSTGRES_URL'), reason='TEST_POSTGRES_URL not configured')
def test_last_place_is_not_double_booked():
    url = os.environ['TEST_POSTGRES_URL']
    schema = 'audit_' + uuid4().hex
    control = create_engine(url)
    with control.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA {schema}'))
    app = Flask('postgres-concurrency')
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI=url,
                      SQLALCHEMY_ENGINE_OPTIONS={'connect_args': {'options': f'-csearch_path={schema}'}},
                      JWT_SECRET_KEY='integration-test-only-key-at-least-32-characters')
    db.init_app(app)
    configure_jwt(JWTManager(app))
    from routes.platform import platform_bp
    app.register_blueprint(platform_bp, url_prefix='/api')
    directory = str(Path(__file__).resolve().parents[1] / 'migrations')
    Migrate(app, db, directory=directory)
    try:
        with app.app_context():
            upgrade(directory=directory)
            users = [User(full_name=f'Person {i}', is_active=True) for i in range(3)]
            db.session.add_all(users)
            db.session.flush()
            gathering = Gathering(code='RACE', owner_id=users[0].id, status='open')
            db.session.add(gathering)
            db.session.flush()
            role = GatheringRole(gathering_id=gathering.id, title_ru='Only place', capacity=1)
            db.session.add(role)
            db.session.commit()
            gid, rid = gathering.id, role.id
            tokens = [create_access_token(identity=str(u.id)) for u in users[1:]]
        barrier = Barrier(2)

        def register(token):
            barrier.wait(timeout=10)
            with app.test_client() as client:
                return client.put(f'/api/events/{gid}/registration',
                    headers={'Authorization': 'Bearer ' + token},
                    json={'answer': 'yes', 'roleId': rid}).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            assert sorted(executor.map(register, tokens)) == [200, 409]
        with app.app_context():
            assert Participant.query.filter_by(role_id=rid, answer='yes').count() == 1
    finally:
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
        with control.begin() as conn:
            conn.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        control.dispose()
