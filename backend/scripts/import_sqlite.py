"""Copy an offline SQLite backup into an EMPTY, migrated PostgreSQL database.

Usage: python scripts/import_sqlite.py /absolute/path/backup.db
Target: DATABASE_URL environment variable. Never changes the source database.
"""
import os
from pathlib import Path
import sqlite3
import sys

from sqlalchemy import create_engine, inspect, select, func, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from models import db
from utils.schema import SCHEMA_HEAD


def transfer(source_path, target_url):
    source_path = Path(source_path).resolve(strict=True)
    if not target_url.startswith('postgresql+psycopg://'):
        raise ValueError('Target must use postgresql+psycopg://')
    source = create_engine('sqlite://', creator=lambda: sqlite3.connect(
        source_path.as_uri() + '?mode=ro', uri=True))
    target = create_engine(target_url)
    counts = {}
    try:
        with source.connect() as src, target.begin() as dst:
            revision = dst.execute(text('SELECT version_num FROM alembic_version')).scalar_one()
            if revision != SCHEMA_HEAD:
                raise ValueError('Run flask db upgrade on the target first')
            tables = db.metadata.sorted_tables
            if any(dst.scalar(select(func.count()).select_from(t)) for t in tables):
                raise ValueError('Target is not empty; no data was imported')
            source_schema = inspect(src)
            for table in tables:
                if not source_schema.has_table(table.name):
                    continue
                present = {c['name'] for c in source_schema.get_columns(table.name)}
                columns = [c for c in table.columns if c.name in present]
                result = src.execute(select(*columns)).mappings()
                count = 0
                while batch := result.fetchmany(500):
                    dst.execute(table.insert(), [dict(row) for row in batch])
                    count += len(batch)
                if dst.scalar(select(func.count()).select_from(table)) != count:
                    raise ValueError('Row count mismatch: ' + table.name)
                counts[table.name] = count
                if 'id' in table.c and isinstance(table.c.id.type, __import__('sqlalchemy').Integer):
                    seq = dst.scalar(text("SELECT pg_get_serial_sequence(:table, 'id')"), {'table': table.name})
                    if seq:
                        maximum = dst.scalar(select(func.max(table.c.id)))
                        dst.execute(text('SELECT setval(CAST(:seq AS regclass), :value, :called)'),
                                    {'seq': seq, 'value': maximum or 1, 'called': maximum is not None})
    finally:
        source.dispose()
        target.dispose()
    return counts


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/import_sqlite.py /path/to/offline-backup.db')
    try:
        counts = transfer(sys.argv[1], os.environ['DATABASE_URL'])
    except Exception as exc:
        # SQLAlchemy errors can contain bind values with personal data and tokens.
        raise SystemExit('Import rolled back: ' + type(exc).__name__ + '. Check schema, constraints and target configuration.') from None
    for table, count in counts.items():
        print(f'{table}: {count}')
