"""Separate private NKO applications from approved public organizations."""
from alembic import op
import sqlalchemy as sa
revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('orgs') as batch:
        batch.add_column(sa.Column('bin', sa.String(12), nullable=True))
        batch.add_column(sa.Column('registration', sa.JSON(), nullable=True))
        batch.create_unique_constraint('uq_orgs_bin', ['bin'])
    from models import OrgApplication
    OrgApplication.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    op.drop_table('org_applications')
    with op.batch_alter_table('orgs') as batch:
        batch.drop_constraint('uq_orgs_bin', type_='unique')
        batch.drop_column('registration')
        batch.drop_column('bin')
