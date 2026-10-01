def test_production_config_allows_no_mail(monkeypatch):
    from config import validate_config
    for key, value in dict(FLASK_ENV='production', SECRET_KEY='a' * 48,
                           JWT_SECRET_KEY='b' * 48,
                           DATABASE_URL='postgresql+psycopg://localhost/test',
                           REDIS_URL='redis://localhost', CORS_ORIGINS='https://example.test',
                           FRONTEND_URL='https://example.test', MAIL_SERVER='',
                           ALLOW_DEMO_LOGIN='0', ERIK_SEED_DEMO='0').items():
        monkeypatch.setenv(key, value)
    assert validate_config()


def test_missing_mail_does_not_create_reset_tokens(client, app, user1, monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setitem(app.config, 'MAIL_SERVER', '')
    for email in (user1.email, 'absent@example.test'):
        response = client.post('/api/auth/forgot-password', json={'email': email})
        assert response.status_code == 503
        assert response.json['code'] == 'email_unavailable'
        assert 'dev_reset_token' not in response.json
    assert user1.reset_token is None


def test_production_does_not_log_unsent_mail(app, monkeypatch, caplog):
    from services.email import send_email
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setitem(app.config, 'MAIL_SERVER', '')
    assert send_email('user@example.test', 'Reset', 'private-reset-token') is False
    assert 'private-reset-token' not in caplog.text
