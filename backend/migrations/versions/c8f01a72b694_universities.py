"""University communities and Microsoft verification."""
from alembic import op
import sqlalchemy as sa

revision = 'c8f01a72b694'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None


def upgrade():
    from models import University, UniversityMembership, UniversityMicrosoftState
    for table in (University.__table__, UniversityMembership.__table__, UniversityMicrosoftState.__table__):
        table.create(op.get_bind(), checkfirst=True)
    if 'university_id' not in {column['name'] for column in sa.inspect(op.get_bind()).get_columns('gatherings')}:
        with op.batch_alter_table('gatherings') as batch:
            batch.add_column(sa.Column('university_id', sa.Integer(), nullable=True))
            batch.create_foreign_key('fk_gatherings_university', 'universities', ['university_id'], ['id'])
            batch.create_index('ix_gatherings_university_id', ['university_id'])


def downgrade():
    with op.batch_alter_table('gatherings') as batch:
        batch.drop_index('ix_gatherings_university_id')
        batch.drop_column('university_id')
    op.drop_table('university_microsoft_states')
    op.drop_table('university_memberships')
    op.drop_table('universities')
