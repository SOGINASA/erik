from redis import RedisError


def test_shared_limiter_denies_when_storage_is_down(client, app, monkeypatch):
    class BrokenRedis:
        def eval(self, *args):
            raise RedisError('unavailable')

    monkeypatch.setitem(app.config, 'TESTING', False)
    monkeypatch.setitem(app.config, 'REDIS_URL', 'redis://test.invalid')
    monkeypatch.setitem(app.extensions, 'rate_limit_redis', BrokenRedis())
    assert client.post('/api/session', json={'deviceId': 'new-device'}).status_code == 503


def test_shared_limiter_returns_retry_after(client, app, monkeypatch):
    class FullRedis:
        def eval(self, *args):
            return 0

    monkeypatch.setitem(app.config, 'TESTING', False)
    monkeypatch.setitem(app.config, 'REDIS_URL', 'redis://test.invalid')
    monkeypatch.setitem(app.extensions, 'rate_limit_redis', FullRedis())
    response = client.post('/api/session', json={'deviceId': 'new-device'})
    assert response.status_code == 429
    assert response.headers['Retry-After'] == '60'
