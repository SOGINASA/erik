"""Explicit maintenance for legacy demo data; never runs at application startup."""
from sqlalchemy import select, or_
from models import db, User, ConversationMember, LegalConsent, Report


def purge_demo_data(*, apply=False, admin_password=None):
    """Delete demo identities and their dependent rows in one transaction.

    Ordinary accounts, password administrators, catalogs and migration history
    survive. The caller must stop writers and back up the database before apply.
    Primary-key sequences are deliberately not reset (old JWT subjects exist).
    """
    tables = list(db.metadata.sorted_tables)
    selected = {t.name: set() for t in tables}
    selected['users'] = set(db.session.scalars(select(User.id).where(
        User.device_id.startswith('demo-'))))
    selected['conversations'] = set(db.session.scalars(
        select(ConversationMember.conversation_id).where(
            ConversationMember.user_id.in_(selected['users']))))
    # Consent records have no FK by design. Only evidence for removed demo
    # identities is included in this explicit maintenance operation.
    selected['legal_consents'] = set(db.session.scalars(select(LegalConsent.id).where(
        LegalConsent.user_id.in_(selected['users']))))
    # The old seed also inserted anonymous reports without any foreign keys.
    # Match their complete seeded text pair, never all anonymous reports.
    from seed import REPORTS
    for target, ru, kz, _count in REPORTS:
        selected['reports'].update(db.session.scalars(select(Report.id).where(
            Report.target_type == target, Report.text_ru == ru, Report.text_kz == kz,
            Report.reporter_id.is_(None), Report.target_id.is_(None))))

    # Follow actual schema dependencies, including uploads, reviews, push
    # subscriptions, attendance, applications and both sides of conversations.
    changed = True
    while changed:
        changed = False
        for table in tables:
            clauses = [fk.parent.in_(selected[fk.column.table.name])
                       for fk in table.foreign_keys
                       if selected[fk.column.table.name]]
            if not clauses or 'id' not in table.c:
                continue
            ids = set(db.session.scalars(select(table.c.id).where(or_(*clauses))))
            new = ids - selected[table.name]
            if new:
                selected[table.name].update(new)
                changed = True

    # Polymorphic moderation targets are not database foreign keys.
    for kind, table_name in [('event', 'gatherings'), ('org', 'orgs'),
                             ('profile', 'users'), ('message', 'messages')]:
        selected['reports'].update(db.session.scalars(select(Report.id).where(
            Report.target_type == kind, Report.target_id.in_(selected[table_name]))))

    admins = User.query.filter(User.user_type == 'admin',
                              User.password_hash.isnot(None),
                              User.is_active.is_(True)).all()
    admins = [u for u in admins if u.id not in selected['users']]
    if not admins:
        raise ValueError('No active password administrator would survive; create-admin first')
    weak_admins = [u for u in admins if u.check_password('admin123')]
    report = {name: len(ids) for name, ids in selected.items() if ids}
    result = {'delete': report, 'kept_admin_ids': [u.id for u in admins],
              'admins_requiring_password_change': [u.id for u in weak_admins], 'applied': False}
    if not apply:
        return result
    if weak_admins and (not admin_password or len(admin_password) < 16):
        raise ValueError('Legacy admin password must be replaced with at least 16 characters')
    try:
        for admin in weak_admins:
            admin.set_password(admin_password)
        for admin in admins:
            admin.token_version += 1
            admin.reset_token = None
            admin.reset_token_expires = None
            admin.verification_token = None
        db.session.flush()
        for table in reversed(tables):
            ids = selected[table.name]
            if ids:
                db.session.execute(table.delete().where(table.c.id.in_(ids)))
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    result['applied'] = True
    return result
