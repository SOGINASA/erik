"""Reproduce both historical meanings of a3 and upgrade without data loss."""
from pathlib import Path
import shutil
import warnings

import pytest
from alembic.script import ScriptDirectory
from flask import Flask
from flask_migrate import Migrate, upgrade
from sqlalchemy import inspect, text

from models import db
from utils.schema import SCHEMA_HEAD

MIGRATIONS = Path(__file__).resolve().parents[1] / 'migrations'


def test_alembic_has_one_head_without_duplicate_revision_warnings():
    with warnings.catch_warnings():
        warnings.simplefilter('error', UserWarning)
        scripts = ScriptDirectory(str(MIGRATIONS))
        assert scripts.get_heads() == [SCHEMA_HEAD]
        list(scripts.walk_revisions())


@pytest.mark.parametrize('legacy', ['oauth', 'universities', 'reviews'])
def test_upgrade_from_each_premerge_history_preserves_data(tmp_path, legacy):
    old = tmp_path / 'migrations'
    shutil.copytree(MIGRATIONS, old, ignore=shutil.ignore_patterns('__pycache__'))
    versions = old / 'versions'
    (versions / 'd9e2710c5f86_reconcile_oauth_universities.py').unlink()
    if legacy == 'oauth':
        (versions / 'c8f01a72b694_universities.py').unlink()
        (versions / 'b4c5d6e7f8a9_review_dataset.py').unlink()
    else:
        (versions / 'a3b4c5d6e7f8_google_oauth.py').unlink()
        university = versions / 'c8f01a72b694_universities.py'
        university.write_text(university.read_text(encoding='utf-8').replace(
            "revision = 'c8f01a72b694'", "revision = 'a3b4c5d6e7f8'").replace(
            "down_revision = 'a3b4c5d6e7f8'", "down_revision = 'f2a3b4c5d6e7'"), encoding='utf-8')
        reviews = versions / 'b4c5d6e7f8a9_review_dataset.py'
        reviews.write_text(reviews.read_text(encoding='utf-8').replace(
            "down_revision = 'c8f01a72b694'", "down_revision = 'a3b4c5d6e7f8'"), encoding='utf-8')

    app = Flask('revision-collision-' + legacy)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + str(tmp_path / 'legacy.db')
    db.init_app(app)
    Migrate(app, db, directory=str(old))
    with app.app_context():
        upgrade(directory=str(old), revision='b4c5d6e7f8a9' if legacy == 'reviews' else 'a3b4c5d6e7f8')
        db.session.execute(text("INSERT INTO users (id, full_name, email) VALUES (1, 'Existing User', 'existing@example.test')"))
        if legacy == 'oauth':
            db.session.execute(text("INSERT INTO oauth_identities (id, provider, subject, user_id) VALUES (1, 'google', 'stable-subject', 1)"))
        else:
            db.session.execute(text("INSERT INTO universities (id, name, city, manager_id) VALUES (1, 'Existing University', 'Test City', 1)"))
        db.session.commit()
        upgrade(directory=str(MIGRATIONS))
        # A second deployment must be a no-op, with the same data and version.
        upgrade(directory=str(MIGRATIONS))
        assert db.session.execute(text('SELECT version_num FROM alembic_version')).scalar_one() == SCHEMA_HEAD
        assert db.session.execute(text('SELECT full_name FROM users WHERE id=1')).scalar_one() == 'Existing User'
        inspector = inspect(db.engine)
        assert {'oauth_identities', 'oauth_login_codes', 'universities', 'university_memberships',
                'university_microsoft_states', 'review_submissions', 'review_decisions'} <= set(inspector.get_table_names())
        assert 'university_id' in {column['name'] for column in inspector.get_columns('gatherings')}
        if legacy == 'oauth':
            assert db.session.execute(text('SELECT subject FROM oauth_identities WHERE user_id=1')).scalar_one() == 'stable-subject'
        else:
            assert db.session.execute(text('SELECT name FROM universities WHERE manager_id=1')).scalar_one() == 'Existing University'
        db.session.remove()
        db.engine.dispose()
