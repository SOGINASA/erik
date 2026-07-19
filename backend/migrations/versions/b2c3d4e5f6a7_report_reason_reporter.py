"""add reason/reporter_id to reports (A14: user-submitted reports)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('reports', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reason', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('reporter_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_reports_reporter', 'users', ['reporter_id'], ['id'])


def downgrade():
    with op.batch_alter_table('reports', schema=None) as batch_op:
        batch_op.drop_constraint('fk_reports_reporter', type_='foreignkey')
        batch_op.drop_column('reporter_id')
        batch_op.drop_column('reason')
