"""Organization profiles, images, reviews, multiple roles and confirmations."""
from alembic import op
import sqlalchemy as sa
revision = 'e1f2a3b4c5d6'
down_revision = 'd0e1f2a3b4c5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('orgs') as batch:
        batch.add_column(sa.Column('contacts', sa.JSON(), nullable=True))
        batch.add_column(sa.Column('office_address', sa.String(500), nullable=True))
        batch.add_column(sa.Column('map_url', sa.String(500), nullable=True))
        batch.add_column(sa.Column('photos', sa.JSON(), nullable=True))
        batch.add_column(sa.Column('coordinators_public', sa.JSON(), nullable=True))
    with op.batch_alter_table('participants') as batch:
        batch.add_column(sa.Column('role_ids', sa.JSON(), nullable=True))
        batch.add_column(sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True))
    # create_all may already have created new tables in an unversioned database.
    from models import OrgReview, UploadedImage
    OrgReview.__table__.create(op.get_bind(), checkfirst=True)
    UploadedImage.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    op.drop_table('uploaded_images')
    op.drop_table('org_reviews')
    with op.batch_alter_table('participants') as batch:
        batch.drop_column('confirmed_at')
        batch.drop_column('role_ids')
    with op.batch_alter_table('orgs') as batch:
        for column in ('coordinators_public', 'photos', 'map_url', 'office_address', 'contacts'):
            batch.drop_column(column)
