"""add image_url to gatherings and charity_requests (обложки событий и сборов)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-19 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('gatherings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('image_url', sa.String(length=300), nullable=True))
    with op.batch_alter_table('charity_requests', schema=None) as batch_op:
        batch_op.add_column(sa.Column('image_url', sa.String(length=300), nullable=True))


def downgrade():
    with op.batch_alter_table('charity_requests', schema=None) as batch_op:
        batch_op.drop_column('image_url')
    with op.batch_alter_table('gatherings', schema=None) as batch_op:
        batch_op.drop_column('image_url')
