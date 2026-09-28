from pathlib import Path
from flask import Flask
from flask_migrate import Migrate, upgrade, downgrade
from sqlalchemy import inspect, text
from models import db


def test_security_migration_upgrade_and_roundtrip(tmp_path):
    app = Flask('migration-test')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + str(tmp_path / 'migration.db')
    db.init_app(app)
    directory = str(Path(__file__).resolve().parents[1] / 'migrations')
    Migrate(app, db, directory=directory)
    with app.app_context():
        upgrade(directory=directory, revision='c9d0e1f2a3b4')
        db.session.execute(text("INSERT INTO users (id, full_name) VALUES (1, 'Existing User')"))
        db.session.commit()
        upgrade(directory=directory)
        assert db.session.execute(text('SELECT token_version FROM users WHERE id=1')).scalar_one() == 0
        assert inspect(db.engine).has_table('used_refresh_tokens')
        assert 'ix_gatherings_status_starts_id' in {i['name'] for i in inspect(db.engine).get_indexes('gatherings')}
        db.session.remove()
        downgrade(directory=directory, revision='c9d0e1f2a3b4')
        upgrade(directory=directory)
        assert db.session.execute(text('SELECT full_name FROM users WHERE id=1')).scalar_one() == 'Existing User'
