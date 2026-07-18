"""add applications (P3: заявки на событие)

Revision ID: a1b2c3d4e5f6
Revises: 0c802611e4f3
Create Date: 2026-07-19 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '0c802611e4f3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'applications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('gathering_id', sa.Integer(), nullable=False),
        sa.Column('applicant_id', sa.Integer(), nullable=False),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('skills', sa.JSON(), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=10), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=32), nullable=True),
        sa.Column('city_id', sa.String(length=3), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['gathering_id'], ['gatherings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['applicant_id'], ['users.id']),
        sa.ForeignKeyConstraint(['org_id'], ['orgs.id']),
        sa.ForeignKeyConstraint(['city_id'], ['cities.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gathering_id', 'applicant_id', name='uq_application'),
    )
    with op.batch_alter_table('applications', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_applications_gathering_id'), ['gathering_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_applications_applicant_id'), ['applicant_id'], unique=False)


def downgrade():
    with op.batch_alter_table('applications', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_applications_applicant_id'))
        batch_op.drop_index(batch_op.f('ix_applications_gathering_id'))
    op.drop_table('applications')
