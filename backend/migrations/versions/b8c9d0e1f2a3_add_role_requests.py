"""add role_requests (заявка волонтёра на роль организатора)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-26 12:00:00.000000

Появилась вместе с запретом волонтёру создавать сборы: путь vol → coord перестал быть
молчаливым побочным эффектом создания сбора и стал заявкой, которую одобряет админ.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'role_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('requested_role', sa.String(length=8), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=10), nullable=True),
        sa.Column('reject_reason', sa.String(length=400), nullable=True),
        sa.Column('decided_by', sa.Integer(), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('role_requests', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_role_requests_user_id'), ['user_id'], unique=False)
        batch_op.create_index('ix_role_request_status', ['status', 'created_at'], unique=False)


def downgrade():
    with op.batch_alter_table('role_requests', schema=None) as batch_op:
        batch_op.drop_index('ix_role_request_status')
        batch_op.drop_index(batch_op.f('ix_role_requests_user_id'))
    op.drop_table('role_requests')
