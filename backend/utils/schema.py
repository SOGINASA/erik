"""Состояние схемы БД: какой ревизии она фактически соответствует.

Нужно потому, что схема в этом проекте поднимается ДВУМЯ путями: миграциями
(alembic) и db.create_all() (zero-config для локалки и демо). У них разная сила:
create_all() заводит недостающие ТАБЛИЦЫ, но не добавляет КОЛОНКИ в существующие.

Отсюда состояние, в котором проект уже ломался: БД от прошлой версии, поднятая
create_all(), получает новую таблицу и НЕ получает новую колонку — и первый же
SELECT по users падает 500 («no such column: users.interests»), что снаружи
выглядит как «сломалась вся система юзеров». Починить это `flask db upgrade`
нельзя: alembic_version в такой БД нет, upgrade идёт с нуля и падает на
«table users already exists». Значит, её надо проштамповать — и штамповать
ПРАВИЛЬНОЙ ревизией, а не head: head пропустил бы недостающие колонки навсегда.
Эту ревизию и определяет detect_revision — по фактическим объектам схемы.
"""

# Цепочка миграций и «отпечаток» каждой: объект, по наличию которого видно, что
# ревизия накатана ((таблица, колонка); колонка None = достаточно самой таблицы).
# Порядок = порядок цепочки, ищем с конца.
#
# Отпечаток выбираем ТОЛЬКО из того, что create_all() воспроизвести не может, если
# ревизия не накатана. Для a7b8c9d0e1f2 это participants.role_id, а НЕ таблица
# gathering_roles: таблицу create_all() создаёт сам, и по ней ревизия определилась
# бы как накатанная при отсутствующей колонке.
#
# Новая миграция — новая строка в конце. Забыть её значит штамповать БД устаревшей
# ревизией: db-sync решит, что всё накатано, и колонка не появится никогда.
SCHEMA_MARKERS = [
    ('0c802611e4f3', ('users', None)),
    ('a1b2c3d4e5f6', ('applications', None)),
    ('b2c3d4e5f6a7', ('reports', 'reason')),
    ('c3d4e5f6a7b8', ('push_subscriptions', None)),
    ('d4e5f6a7b8c9', ('gatherings', 'image_url')),
    ('e5f6a7b8c9d0', ('gatherings', 'reject_reason')),
    ('f6a7b8c9d0e1', ('users', 'interests')),
    ('a7b8c9d0e1f2', ('participants', 'role_id')),
]

SCHEMA_HEAD = SCHEMA_MARKERS[-1][0]


def detect_revision(insp):
    """Ревизия, которой фактически соответствует схема. None — БД пустая/чужая.

    insp — sqlalchemy.inspect(engine или connection).
    """
    tables = set(insp.get_table_names())
    cols = {}

    def has(table, column):
        if table not in tables:
            return False
        if column is None:
            return True
        if table not in cols:
            cols[table] = {c['name'] for c in insp.get_columns(table)}
        return column in cols[table]

    for rev, (table, column) in reversed(SCHEMA_MARKERS):
        if has(table, column):
            return rev
    return None


def schema_lag(insp):
    """Ревизия отставшей БД — или None, если отставания нет/оно не наше дело.

    None возвращаем в трёх случаях: БД под alembic (её ведёт upgrade), БД пустая,
    схема уже на head.
    """
    if insp.has_table('alembic_version'):
        return None
    rev = detect_revision(insp)
    return None if rev is None or rev == SCHEMA_HEAD else rev
