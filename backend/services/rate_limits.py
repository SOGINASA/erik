"""Atomic, shared sliding-window limits. Redis outages fail closed."""
from hashlib import sha256
from uuid import uuid4
from flask import current_app
from redis import Redis, RedisError

SCRIPT = """
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[1]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1
"""


def allow_request(key, limit, seconds):
    if 'rate_limit_redis' not in current_app.extensions:
        current_app.extensions['rate_limit_redis'] = Redis.from_url(
            current_app.config['REDIS_URL'], socket_timeout=2, socket_connect_timeout=2)
    client = current_app.extensions['rate_limit_redis']
    try:
        return bool(client.eval(SCRIPT, 1, 'erik:rl:' + sha256(key.encode()).hexdigest(),
                                seconds * 1000, limit, str(uuid4())))
    except RedisError:
        current_app.logger.error('Rate limit storage unavailable')
        return None
