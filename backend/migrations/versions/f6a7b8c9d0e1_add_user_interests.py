"""add users.interests (темы волонтёра для признака interest_match ML-прогноза)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-26 02:10:00.000000

Зачем: модель прогноза явки использует признак interest_match (совпала ли тема
сбора с интересами волонтёра) — по permutation-важности он второй после самого
ответа. В качестве интересов бэкенд подставлял User.skills, но там лежат навыки
(«Организация», «Водитель»), а не id тем ('eco', 'edu'), поэтому признак был
тождественно нулевым и модель в проде теряла один из двух сильнейших сигналов.
"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('interests', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('interests')
