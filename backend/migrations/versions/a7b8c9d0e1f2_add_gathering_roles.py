"""add gathering_roles (роли волонтёров на сборе: кто раздаёт, кто снимает)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-26 02:40:00.000000

Зачем: на сборе у волонтёров разные задачи, и координатору нужно объявить их заранее,
а волонтёру — выбрать свою при записи. Роль живёт отдельной строкой (а не текстом в
участнике), потому что у неё есть вместимость, порядок и переименование.

Про FK у participants.role_id: колонка добавляется БЕЗ create_foreign_key намеренно.
batch_alter_table.create_foreign_key на SQLite пересоздаёт таблицу целиком, а participants —
самая горячая таблица проекта (ix_participant_poll, uq_participant_user). Платить
пересозданием не за что: PRAGMA foreign_keys в приложении нигде не включается, поэтому
ondelete='SET NULL' всё равно не сработает и role_id чистится явным UPDATE (services/roles.py).
В модели FK объявлен — так схема честнее и db.create_all() (тесты) построит её полностью.
"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    # Шаги идемпотентны намеренно. Zero-config путь проекта поднимает схему через
    # db.create_all() (app.py), а он заводит недостающие ТАБЛИЦЫ, но не добавляет
    # КОЛОНКИ в существующие. На БД от прошлой версии это даёт ровно половину этой
    # миграции: gathering_roles уже создана, participants.role_id ещё нет. Голый
    # create_table на такой БД падает на «table already exists» и блокирует её
    # починку (flask db-sync) — то есть чинить приходится руками ту самую БД,
    # ради которой миграция и писалась.
    # Пропускать существующее безопасно: create_all() строит таблицу из этой же
    # модели, форма совпадает один в один.
    insp = sa.inspect(op.get_bind())

    if 'gathering_roles' not in insp.get_table_names():
        op.create_table(
            'gathering_roles',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('gathering_id', sa.Integer(), nullable=False),
            sa.Column('title_ru', sa.String(length=60), nullable=False),
            sa.Column('title_kz', sa.String(length=60), nullable=False),
            sa.Column('capacity', sa.Integer(), nullable=True),
            sa.Column('newbie', sa.Boolean(), nullable=True, server_default=sa.text('0')),
            sa.Column('preset', sa.String(length=24), nullable=True),
            sa.Column('sort', sa.Integer(), nullable=True, server_default=sa.text('0')),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['gathering_id'], ['gatherings.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('gathering_id', 'title_ru', name='uq_grole_title'),
        )
        with op.batch_alter_table('gathering_roles', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_gathering_roles_gathering_id'), ['gathering_id'], unique=False)

    if 'role_id' not in {c['name'] for c in insp.get_columns('participants')}:
        with op.batch_alter_table('participants', schema=None) as batch_op:
            batch_op.add_column(sa.Column('role_id', sa.Integer(), nullable=True))
            batch_op.create_index(batch_op.f('ix_participants_role_id'), ['role_id'], unique=False)


def downgrade():
    with op.batch_alter_table('participants', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_participants_role_id'))
        batch_op.drop_column('role_id')

    with op.batch_alter_table('gathering_roles', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_gathering_roles_gathering_id'))
    op.drop_table('gathering_roles')
