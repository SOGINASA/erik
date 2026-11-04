"""Self-service role selection creates a request; only administrators grant it."""
from models import db, User, RoleRequest, ORGANIZER_ROLES


def request_organizer_role(user, role, message=None):
    if user.role is None:
        user.role = 'vol'
    if role not in ORGANIZER_ROLES or user.role in ORGANIZER_ROLES:
        return None
    if not (user.full_name or '').strip():
        return None
    db.session.flush()
    # Serialize simultaneous submissions for the same account on PostgreSQL.
    User.query.filter_by(id=user.id).with_for_update().one()
    pending = RoleRequest.query.filter_by(user_id=user.id, status='pending').first()
    if pending is not None:
        return pending
    row = RoleRequest(user_id=user.id, requested_role=role, status='pending',
                      message=(message or '').strip()[:1000] or None)
    db.session.add(row)
    db.session.flush()
    return row
