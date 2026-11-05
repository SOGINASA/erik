"""Google identity links and short-lived login handoffs; existing users unchanged."""
from alembic import op
import sqlalchemy as sa

revision = 'a3b4c5d6e7f8'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    # Development create_all may have created these tables before db-sync runs.
    if 'oauth_identities' not in tables:
        op.create_table('oauth_identities',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('provider', sa.String(20), nullable=False),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.UniqueConstraint('provider', 'subject', name='uq_oauth_provider_subject'),
            sa.UniqueConstraint('user_id', 'provider', name='uq_oauth_user_provider'))
        op.create_index('ix_oauth_identities_user_id', 'oauth_identities', ['user_id'])
    if 'oauth_login_codes' not in tables:
        op.create_table('oauth_login_codes',
            sa.Column('code_hash', sa.String(64), primary_key=True),
            sa.Column('challenge', sa.String(43), nullable=False),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('email', sa.String(120), nullable=False),
            sa.Column('full_name', sa.String(100), nullable=False),
            sa.Column('expires_at', sa.BigInteger(), nullable=False))
        op.create_index('ix_oauth_login_codes_expires_at', 'oauth_login_codes', ['expires_at'])


def downgrade():
    op.drop_table('oauth_login_codes')
    op.drop_table('oauth_identities')
