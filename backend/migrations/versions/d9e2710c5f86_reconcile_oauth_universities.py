"""Repair deployments that stamped either meaning of the collided a3 revision.

The OAuth and university branches originally used the same revision ID. A DB
at a3 (or at the university branch's b4) can therefore be missing either schema.
Re-run both idempotent historical upgrades without changing existing rows or
manually rewriting alembic_version. Downgrading this repair removes no data;
the original migrations still own their tables and columns.
"""
from pathlib import Path

from alembic.util import load_python_file

revision = 'd9e2710c5f86'
down_revision = 'b4c5d6e7f8a9'
branch_labels = None
depends_on = None


def upgrade():
    directory = str(Path(__file__).parent)
    for filename in ('a3b4c5d6e7f8_google_oauth.py', 'c8f01a72b694_universities.py'):
        load_python_file(directory, filename).upgrade()


def downgrade():
    pass
