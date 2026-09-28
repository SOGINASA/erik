"""Append-only legal consent evidence; existing users are not backfilled.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d0e1f2a3b4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'legal_consents',
        sa.Column('id', sa.Integer(), nullable=False),
        # Intentionally independent of account deletion; retained evidence is purged
        # by the operator according to the published retention policy.
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('subject_name', sa.String(length=100), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('version', sa.String(length=64), nullable=False),
        sa.Column('source', sa.String(length=40), nullable=False),
        sa.Column('terms_accepted', sa.Boolean(), nullable=False),
        sa.Column('privacy_accepted', sa.Boolean(), nullable=False),
        sa.Column('consent_accepted', sa.Boolean(), nullable=False),
        sa.Column('adult_confirmed', sa.Boolean(), nullable=False),
        sa.Column('document_snapshot', sa.JSON(), nullable=False),
        sa.Column('document_sha256', sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_legal_consents_user_id', 'legal_consents', ['user_id'])


def downgrade():
    op.drop_index('ix_legal_consents_user_id', table_name='legal_consents')
    op.drop_table('legal_consents')
