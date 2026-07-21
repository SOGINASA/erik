import os
from datetime import timedelta

# Путь к директории backend
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_DIR = os.path.join(BACKEND_DIR, 'database')


def _cors_origins():
    """CORS origins из env (через запятую) или дефолт для локальной разработки"""
    raw = os.environ.get('CORS_ORIGINS')
    if raw:
        return [o.strip() for o in raw.split(',') if o.strip()]
    return ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000']


def _database_uri():
    """URI БД. DATABASE_URL из окружения имеет приоритет.

    ОТНОСИТЕЛЬНЫЙ sqlite-путь (напр. sqlite:///database/database.db) приводим к
    АБСОЛЮТНОМУ относительно backend/. Иначе Flask-SQLAlchemy разрешает его
    относительно instance-папки (backend/instance/…) — файл создаётся не там,
    где app.py создаёт директорию → sqlite3 'unable to open database file'.
    Абсолютные пути (в т.ч. sqlite:////app/... из docker-compose), :memory: и
    не-sqlite URL (postgres и пр.) не трогаем.
    """
    url = os.environ.get('DATABASE_URL')
    if not url:
        return f'sqlite:///{os.path.join(DATABASE_DIR, "database.db")}'
    prefix = 'sqlite:///'
    if url.startswith(prefix):
        path = url[len(prefix):]
        if path and path != ':memory:' and not os.path.isabs(path):
            return f'{prefix}{os.path.join(BACKEND_DIR, path)}'
    return url


# Публично известные dev-дефолты — в проде их использование запрещено (см. validate_config).
_DEFAULT_SECRET = 'dev-secret-key-change-in-production'
_DEFAULT_JWT_SECRET = 'dev-jwt-secret-key-change-in-production'


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', _DEFAULT_SECRET)

    # Database — всегда предпочитаем DATABASE_URL из окружения.
    # Без него создаётся ЛОКАЛЬНЫЙ SQLite-файл в database/.
    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # CORS
    CORS_ORIGINS = _cors_origins()

    # JWT
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', _DEFAULT_JWT_SECRET)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # erik: базовый URL для ссылки-приглашения erik.kz/g/<code>
    SHARE_BASE_URL = os.environ.get('SHARE_BASE_URL', 'https://erik.kz')
    # Базовый URL фронта (для ссылок сброса пароля/верификации в письмах)
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # Почта (опционально). Без MAIL_SERVER письма логируются, а не отправляются (dev).
    MAIL_SERVER = os.environ.get('MAIL_SERVER')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() != 'false'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_FROM = os.environ.get('MAIL_FROM', 'no-reply@erik.kz')


class DevelopmentConfig(Config):
    """Конфигурация для разработки"""
    DEBUG = True


class TestingConfig(Config):
    """Конфигурация для тестирования"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)


class ProductionConfig(Config):
    """Конфигурация для продакшена"""
    DEBUG = False


config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}


def get_config():
    """Получить текущую конфигурацию по FLASK_ENV"""
    return config.get(os.environ.get('FLASK_ENV') or 'default', DevelopmentConfig)


def validate_config():
    """Проверить критичные настройки в проде. Бросает RuntimeError при небезопасной конфигурации.

    Вызывается из create_app при FLASK_ENV=production, чтобы приложение НЕ поднималось
    с публично известными dev-секретами (иначе тривиальная подделка JWT/админ-токена)."""
    if os.environ.get('FLASK_ENV') != 'production':
        return True

    errors = []
    for var in ('SECRET_KEY', 'JWT_SECRET_KEY', 'DATABASE_URL'):
        if not os.environ.get(var):
            errors.append(f'Переменная окружения {var} обязательна в продакшене')
    if os.environ.get('SECRET_KEY') == _DEFAULT_SECRET:
        errors.append('SECRET_KEY использует dev-дефолт — задайте уникальный секрет')
    if os.environ.get('JWT_SECRET_KEY') == _DEFAULT_JWT_SECRET:
        errors.append('JWT_SECRET_KEY использует dev-дефолт — задайте уникальный секрет')

    if errors:
        raise RuntimeError('Небезопасная конфигурация продакшена:\n  • ' + '\n  • '.join(errors))
    return True
