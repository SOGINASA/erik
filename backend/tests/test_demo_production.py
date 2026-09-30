import runpy
from pathlib import Path

import pytest

from models import db, User


@pytest.mark.parametrize('enabled', [False, True])
def test_production_demo_login(client, app, monkeypatch, enabled):
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setitem(app.config, 'ALLOW_DEMO_LOGIN', enabled)
    user = User(device_id='demo-admin', email='admin@erik.kz',
                full_name='Demo Admin', user_type='admin', role='vol', is_active=True)
    user.set_password('admin123')
    db.session.add(user)
    db.session.commit()

    response = client.post('/api/session', json={'deviceId': 'demo-admin'})
    assert response.status_code == (200 if enabled else 403)
    if enabled:
        assert response.json['user']['user_type'] == 'admin'
        assert response.json['token']
    response = client.post('/api/auth/login', json={
        'email': 'admin@erik.kz', 'password': 'admin123'})
    assert response.status_code == (200 if enabled else 401)


@pytest.mark.parametrize('demo_setting', [None, '1', '0'])
def test_production_config_accepts_demo_setting(monkeypatch, demo_setting):
    for key, value in dict(FLASK_ENV='production', SECRET_KEY='a' * 48,
                           JWT_SECRET_KEY='b' * 48,
                           DATABASE_URL='postgresql+psycopg://localhost/test',
                           REDIS_URL='redis://localhost', CORS_ORIGINS='https://example.test',
                           FRONTEND_URL='https://example.test',
                           ALLOW_DEMO_LOGIN='1', ERIK_SEED_DEMO='0').items():
        monkeypatch.setenv(key, value)
    if demo_setting is None:
        monkeypatch.delenv('ALLOW_DEMO_LOGIN', raising=False)
    else:
        monkeypatch.setenv('ALLOW_DEMO_LOGIN', demo_setting)
    monkeypatch.delenv('REQUIRE_LEGAL_CONFIGURATION', raising=False)
    config = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'config.py'))
    assert config['ProductionConfig'].ALLOW_DEMO_LOGIN is (demo_setting != '0')
    assert config['ProductionConfig'].REQUIRE_LEGAL_CONFIGURATION is False
    assert config['validate_config']()
    monkeypatch.setenv('ERIK_SEED_DEMO', '1')
    with pytest.raises(RuntimeError):
        config['validate_config']()
