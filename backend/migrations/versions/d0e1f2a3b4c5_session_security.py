"""Persistent session revocation and refresh replay protection."""
from alembic import op
import sqlalchemy as sa

revision = 'd0e1f2a3b4c5'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))
    indices = {idx['name'] for idx in sa.inspect(op.get_bind()).get_indexes('gatherings')}
    for name, columns in (
        ('ix_gatherings_status_starts_id', ['status', 'starts_at', 'id']),
        ('ix_gatherings_city_status_starts', ['city_id', 'status', 'starts_at']),
    ):
        if name not in indices:
            op.create_index(name, 'gatherings', columns)
    if not sa.inspect(op.get_bind()).has_table('used_refresh_tokens'):
        op.create_table('used_refresh_tokens',
                        sa.Column('jti', sa.String(36), primary_key=True),
                        sa.Column('expires_at', sa.BigInteger(), nullable=False))
        op.create_index('ix_used_refresh_tokens_expires_at', 'used_refresh_tokens', ['expires_at'])


def downgrade():
    op.drop_index('ix_gatherings_status_starts_id', 'gatherings')
    op.drop_index('ix_gatherings_city_status_starts', 'gatherings')
    op.drop_table('used_refresh_tokens')
    op.drop_column('users', 'token_version')
