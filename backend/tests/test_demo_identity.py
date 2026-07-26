"""Демо-личности (demo-*) заводит только сид, а сид переживает их пустышки.

Регрессия с прода. На свежем деплое база пустая (файл БД в git не едет), и кнопка
быстрого входа «Координатор» дёргала POST /session с deviceId='demo-coord'. Юзера
с таким device_id не было — и он создавался ПУСТЫМ: без имени, с дефолтным
role='vol'. Последствия шли каскадом:
  • пользователь входил «координатором» без роли и без имени;
  • все @profiled_required отвечали 403 «Заполните имя»;
  • следующий `flask seed-demo` падал на UNIQUE(device_id) и требовал --reset.
"""
from models import db, User
from seed import _demo_user


def test_unseeded_demo_persona_is_refused(client):
    """Демо-личности нет в базе → 404 с рецептом, а не молчаливая пустышка."""
    r = client.post('/api/session', json={'deviceId': 'demo-coord'})
    assert r.status_code == 404
    assert 'seed-demo' in r.get_json()['error']
    assert User.query.filter_by(device_id='demo-coord').first() is None


def test_refusal_creates_nothing(client):
    """Отказ не должен оставлять следов — иначе сид опять упадёт на UNIQUE."""
    before = User.query.count()
    for dev in ('demo-v0', 'demo-admin', 'demo-org1', 'demo-p3'):
        assert client.post('/api/session', json={'deviceId': dev}).status_code == 404
    assert User.query.count() == before


def test_seeded_demo_persona_logs_in_normally(client):
    """Засеянная личность входит как обычно — запрет только на СОЗДАНИЕ."""
    db.session.add(User(device_id='demo-coord', full_name='Асхат Жумабеков',
                        role='coord', user_type='user', is_active=True))
    db.session.commit()

    r = client.post('/api/session', json={'deviceId': 'demo-coord'})
    assert r.status_code == 200
    user = r.get_json()['user']
    assert user['full_name'] == 'Асхат Жумабеков' and user['role'] == 'coord'


def test_regular_device_user_is_still_created(client):
    """Обычные устройства заводятся как раньше — запрет узкий, только demo-*."""
    r = client.post('/api/session', json={'deviceId': 'a1b2c3-real-device'})
    assert r.status_code == 201
    assert r.get_json()['user']['role'] == 'vol'
    assert User.query.filter_by(device_id='a1b2c3-real-device').first() is not None


def test_demo_user_backfills_existing_shell():
    """_demo_user дозаполняет пустышку, а не падает и не пропускает её.

    Пропуск был бы не лучше падения: «координатор» так и остался бы без имени и
    с role='vol' — ровно тот симптом, с которого началось расследование.
    """
    db.session.add(User(device_id='demo-coord', full_name=None, role='vol',
                        user_type='user', is_active=True))
    db.session.commit()

    u = _demo_user('demo-coord', full_name='Асхат Жумабеков', role='coord',
                   city_id='pet', user_type='user', is_active=True, reliability=91)
    db.session.commit()

    assert User.query.filter_by(device_id='demo-coord').count() == 1   # не дубль
    assert u.full_name == 'Асхат Жумабеков'
    assert u.role == 'coord' and u.reliability == 91


def test_demo_user_creates_when_absent():
    u = _demo_user('demo-v0', full_name='Аружан Сапарова', role='vol', user_type='user')
    db.session.commit()
    assert u.id is not None
    assert User.query.filter_by(device_id='demo-v0').one().full_name == 'Аружан Сапарова'


def test_demo_user_is_idempotent():
    """Повторный вызов не плодит строк — условие автосида (seed-demo --if-empty)."""
    for _ in range(3):
        _demo_user('demo-admin', full_name='Администратор erik',
                   role='vol', user_type='admin', is_active=True)
    db.session.commit()
    assert User.query.filter_by(device_id='demo-admin').count() == 1
