import os

# Подхватываем backend/.env до чтения любых os.environ
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import click
from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_jwt_extended.exceptions import JWTExtendedException
from werkzeug.exceptions import HTTPException

from config import get_config, DATABASE_DIR, validate_config
from models import db, User

from utils.schema import SCHEMA_HEAD, detect_revision, schema_lag

# Инициализация расширений
migrate = Migrate()
jwt = JWTManager()


def _warn_if_schema_behind(app):
    """Громко предупредить, что БД отстала от моделей.

    create_all() добавляет недостающие ТАБЛИЦЫ, но не КОЛОНКИ в существующие. БД от
    прошлой версии остаётся наполовину обновлённой — новая таблица есть, новой колонки
    нет — и первый же SELECT по users падает 500. Молча это проходить не должно:
    симптом выглядит как «сломалась вся система юзеров», а чинится одной командой.
    """
    from sqlalchemy import inspect

    rev = schema_lag(inspect(db.engine))
    if rev is None:
        return
    app.logger.warning(
        '[db] схема БД отстала: соответствует %s, нужна %s. '
        'db.create_all() колонки в существующие таблицы не добавляет — '
        'запросы к users/participants будут падать. Почините: flask db-sync',
        rev, SCHEMA_HEAD)


def create_app(config_object=None):
    app = Flask(__name__)
    app.config.from_object(config_object or get_config())
    # В проде не поднимаемся с публично известными dev-секретами (иначе подделка JWT).
    validate_config()
    CORS(app, supports_credentials=True, origins=app.config['CORS_ORIGINS'])

    # Создаём папку для БД, если её нет
    os.makedirs(DATABASE_DIR, exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    # Для локальной разработки/демо схема поднимается create_all() (zero-config).
    # В проде используйте миграции: `flask db-sync` и запуск с SKIP_DB_CREATE=1.
    # Флаг также нужен при генерации миграций (autogenerate против пустой БД).
    if os.environ.get('SKIP_DB_CREATE') != '1':
        with app.app_context():
            db.create_all()
            _warn_if_schema_behind(app)

    # Регистрация блюпринтов
    from routes import (auth_bp, admin_bp, session_bp, gatherings_bp, guest_bp,
                        notifications_bp, platform_bp, organizer_bp)
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(session_bp, url_prefix='/api')          # /api/session, /api/me, /api/logout
    app.register_blueprint(gatherings_bp, url_prefix='/api/gatherings')
    app.register_blueprint(guest_bp, url_prefix='/api')            # /api/g/<code>, /api/gatherings/by-code
    app.register_blueprint(notifications_bp, url_prefix='/api')    # /api/notifications*
    app.register_blueprint(platform_bp, url_prefix='/api')         # /api/events, /orgs, /charity, /leaderboard, /cities…
    app.register_blueprint(organizer_bp, url_prefix='/api')        # /api/me/org/*, /events/<id>/applications, /applications/*

    # Безопасность целостности БД: при исключении в запросе откатываем сессию,
    # чтобы «отравленная» транзакция не ломала следующие запросы того же воркера.
    @app.teardown_request
    def _rollback_on_error(exc):
        if exc is not None:
            db.session.rollback()

    # Прогрев ML-модели на старте воркера: распаковка joblib занимает ~2-3 с, и без
    # прогрева её платит первый же координатор, открывший сбор, — в каждом из
    # воркеров gunicorn. Под флагом, чтобы локальный запуск и тесты не тормозили.
    if os.environ.get('ERIK_ML_WARMUP') == '1':
        try:
            from services.attendance_ml import warmup
            app.logger.info('[ml] прогрев модели прогноза: %s', warmup())
        except Exception as exc:                      # noqa: BLE001 — старт важнее ML
            app.logger.warning('[ml] прогрев не удался: %s', exc)

    # Главная страница API
    @app.route('/api')
    def api_info():
        return jsonify({
            'message': 'API is alive',
            'version': '1.1.0',
            'endpoints': {
                'auth': '/api/auth - аккаунты (email/пароль), НКО и админ',
                'session': '/api/session - device-вход, /api/me - профиль',
                'gatherings': '/api/gatherings - сборы, прогноз, отметка явки',
                'guest': '/api/g/<code> - участник: просмотр и RSVP',
                'admin': '/api/admin - администрирование пользователей',
            },
        })

    return app


app = create_app()


# Обработчики ошибок
@app.errorhandler(422)
def handle_unprocessable_entity(err):
    return jsonify({'error': 'Validation error', 'message': str(err)}), 422


@app.errorhandler(JWTExtendedException)
def handle_jwt_error(e):
    return jsonify({'error': 'JWT Error', 'message': str(e)}), 401


@app.errorhandler(HTTPException)
def handle_http_exception(e):
    return jsonify({'error': e.code, 'message': e.description}), e.code


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Токен истек'}), 401


@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({'error': 'Недействительный токен'}), 401


@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({'error': 'Требуется авторизация'}), 401


# CLI команды
@app.cli.command()
def init_db():
    """Инициализация базы данных"""
    print('Инициализация базы данных...')
    db.create_all()
    print('База данных инициализирована!')


@app.cli.command('db-sync')
def db_sync():
    """Привести схему БД к head. Единая точка входа вместо `flask db upgrade`.

    Безопасна для всех трёх состояний, в которых БД этого проекта реально бывает:
      1) пустая: прогоняем всю цепочку миграций;
      2) под alembic: обычный upgrade;
      3) поднята create_all() без alembic_version: штампуем ревизией, которой схема
         ФАКТИЧЕСКИ соответствует (_detect_revision), и докатываем остальное. Голый
         upgrade тут упал бы на «table users already exists».

    Текст сообщений — ASCII-safe: команду зовёт и Windows-консоль в cp1251, где
    печать стрелок и прочей типографики роняет click с UnicodeEncodeError.
    """
    from sqlalchemy import inspect
    from flask_migrate import stamp, upgrade

    insp = inspect(db.engine)
    if insp.get_table_names() and not insp.has_table('alembic_version'):
        rev = detect_revision(insp)
        if rev is None:
            raise click.ClickException(
                'БД непустая, но не похожа на схему erik — штамповать нечем. '
                'Проверьте DATABASE_URL или начните с пустой БД.')
        click.echo(f'БД без alembic_version: штампую {rev} по фактической схеме')
        stamp(revision=rev)

    upgrade()
    click.echo('Схема БД на head.')


@app.cli.command('seed-demo')
@click.option('--reset', is_flag=True, default=False,
              help='Полностью очистить доменные таблицы и пересоздать демо (аккаунты сохраняются)')
@click.option('--if-empty', is_flag=True, default=False,
              help='Ничего не делать, если в базе уже есть пользователи (автосид при деплое)')
def seed_demo_cmd(reset, if_empty):
    """Засеять детерминированную демо-синтетику (сбор PARK18 и участники).

    --if-empty для entrypoint: файл БД в git не едет (.gitignore), поэтому свежий
    деплой поднимает ПУСТУЮ базу — платформа без событий, а кнопки быстрого входа
    ведут в никуда. Флаг делает шаг безопасным для повторных стартов: на живой базе
    он просто ничего не трогает.
    """
    from seed import seed_demo

    if if_empty:
        n = User.query.count()
        if n:
            click.echo(f'seed-demo: в базе уже {n} пользователей, пропускаю')
            return
        click.echo('seed-demo: база пустая, засеваю демо-данные')

    seed_demo(reset=reset)
    print('Готово.')


@app.cli.command()
def create_admin():
    """Создать администратора"""
    email = input('Email администратора: ')
    password = input('Пароль: ')
    full_name = input('Полное имя: ')

    if User.query.filter_by(email=email).first():
        print('Пользователь с таким email уже существует')
        return

    admin = User(full_name=full_name, email=email, user_type='admin', is_verified=True)
    admin.set_password(password)

    db.session.add(admin)
    db.session.commit()

    print(f'Администратор {email} создан')


if __name__ == '__main__':
    # DEBUG только вне прода. В проде запускайте через WSGI (gunicorn), не app.run.
    is_prod = os.environ.get('FLASK_ENV') == 'production'
    app.run(debug=not is_prod, host=os.environ.get('HOST', '127.0.0.1'),
            port=int(os.environ.get('PORT', 5000)))
