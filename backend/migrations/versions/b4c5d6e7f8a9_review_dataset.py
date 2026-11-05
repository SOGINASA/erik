"""Versioned application inputs and append-only review labels."""
from alembic import op
from models import ReviewSubmission, ReviewDecision

revision = 'b4c5d6e7f8a9'
down_revision = 'c8f01a72b694'
branch_labels = None
depends_on = None


def upgrade():
    for model in (ReviewSubmission, ReviewDecision):
        model.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    op.drop_table('review_decisions')
    op.drop_table('review_submissions')
