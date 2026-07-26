"""Определение ревизии по фактической схеме (utils/schema.py).

Зачем эти тесты: БД, поднятая db.create_all(), не имеет alembic_version, и чтобы её
починить, db-sync сначала штампует её ревизией, которой схема соответствует. Ошибка
здесь дороже обычной: заштамповать head на отставшей схеме — значит НАВСЕГДА пропустить
недостающие колонки, причём молча. Ровно так проект и слёг: gathering_roles уже была
(её создал create_all), а participants.role_id не было, и любой запрос к ростеру падал.
"""
import sqlite3

import pytest
from sqlalchemy import create_engine, inspect

from utils.schema import SCHEMA_HEAD, SCHEMA_MARKERS, detect_revision, schema_lag


def _inspect(path):
    return inspect(create_engine(f'sqlite:///{path}'))


def _make_db(path, ddl):
    conn = sqlite3.connect(str(path))
    for stmt in ddl:
        conn.execute(stmt)
    conn.commit()
    conn.close()


# Схема на ревизии e5f6a7b8c9d0: reject_reason уже есть, users.interests ещё нет.
_AT_E5F6 = [
    'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)',
    'CREATE TABLE applications (id INTEGER PRIMARY KEY)',
    'CREATE TABLE reports (id INTEGER PRIMARY KEY, reason TEXT)',
    'CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY)',
    'CREATE TABLE gatherings (id INTEGER PRIMARY KEY, image_url TEXT, reject_reason TEXT)',
    'CREATE TABLE participants (id INTEGER PRIMARY KEY)',
]


def test_empty_db_has_no_revision(tmp_path):
    path = tmp_path / 'empty.db'
    sqlite3.connect(str(path)).close()
    assert detect_revision(_inspect(path)) is None


def test_detects_revision_by_actual_columns(tmp_path):
    path = tmp_path / 'old.db'
    _make_db(path, _AT_E5F6)
    assert detect_revision(_inspect(path)) == 'e5f6a7b8c9d0'


def test_half_upgraded_db_is_not_mistaken_for_head(tmp_path):
    """Главный сценарий: create_all() создал новую ТАБЛИЦУ, но не новую КОЛОНКУ.

    Если считать ревизию по gathering_roles, получится head — и participants.role_id
    не появится уже никогда. Отпечаток берётся по колонке именно поэтому.
    """
    path = tmp_path / 'half.db'
    _make_db(path, _AT_E5F6 + [
        'ALTER TABLE users ADD COLUMN interests TEXT',
        'CREATE TABLE gathering_roles (id INTEGER PRIMARY KEY, gathering_id INTEGER)',
    ])
    insp = _inspect(path)
    assert detect_revision(insp) == 'f6a7b8c9d0e1'      # НЕ head
    assert schema_lag(insp) == 'f6a7b8c9d0e1'           # и это отставание


def test_current_models_are_at_head(app):
    """create_all() по текущим моделям обязан определяться как head.

    Иначе SCHEMA_MARKERS отстал от миграций: забытая строка означает, что db-sync
    штампует свежую БД старой ревизией и потом падает, накатывая уже существующее.
    """
    from models import db

    with app.app_context():
        insp = inspect(db.engine)
        assert detect_revision(insp) == SCHEMA_HEAD
        assert schema_lag(insp) is None


def test_alembic_managed_db_is_left_alone(tmp_path):
    """У БД под alembic отставание не наше дело — его закрывает upgrade."""
    path = tmp_path / 'stamped.db'
    _make_db(path, _AT_E5F6 + ['CREATE TABLE alembic_version (version_num TEXT)'])
    assert schema_lag(_inspect(path)) is None


def test_markers_cover_every_migration():
    """Каждой миграции — своя строка в SCHEMA_MARKERS, в том же порядке."""
    import os
    import re

    versions = os.path.join(os.path.dirname(__file__), '..', 'migrations', 'versions')
    chain = {}          # revision -> down_revision
    for fn in os.listdir(versions):
        if not fn.endswith('.py'):
            continue
        src = open(os.path.join(versions, fn), encoding='utf-8').read()
        rev = re.search(r"^revision = '([^']+)'", src, re.M).group(1)
        down = re.search(r"^down_revision = (?:'([^']+)'|None)", src, re.M).group(1)
        chain[rev] = down

    marked = [rev for rev, _ in SCHEMA_MARKERS]
    assert set(marked) == set(chain), 'SCHEMA_MARKERS разошёлся со списком миграций'
    # порядок маркеров должен совпадать с порядком цепочки
    for prev, cur in zip(marked, marked[1:]):
        assert chain[cur] == prev, f'{cur} идёт не после {prev}'


@pytest.mark.parametrize('rev,marker', SCHEMA_MARKERS)
def test_marker_column_exists_in_models(app, rev, marker):
    """Отпечаток должен существовать в текущих моделях — иначе он не сработает никогда."""
    from models import db

    table, column = marker
    with app.app_context():
        insp = inspect(db.engine)
        assert insp.has_table(table)
        if column is not None:
            assert column in {c['name'] for c in insp.get_columns(table)}
