from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from models import db, User, Org, Report
from utils.decorators import admin_required
from utils.serializers import serialize_org

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """Список пользователей с пагинацией и поиском"""
    page = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 20)), 100)
    search = request.args.get('search', '').strip()

    query = User.query.order_by(User.created_at.desc())

    if search:
        like = f'%{search.lower()}%'
        query = query.filter(
            db.or_(
                db.func.lower(User.email).like(like),
                db.func.lower(User.nickname).like(like),
                db.func.lower(User.full_name).like(like),
            )
        )

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'users': [u.to_dict(include_sensitive=True) for u in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@admin_bp.route('/users/<int:user_id>', methods=['PATCH'])
@admin_required
def update_user(user_id):
    """Изменение статуса/роли пользователя"""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 404

    data = request.get_json() or {}

    if 'is_active' in data:
        user.is_active = bool(data['is_active'])
    if 'is_verified' in data:
        user.is_verified = bool(data['is_verified'])
    if 'user_type' in data and data['user_type'] in ('user', 'admin'):
        user.user_type = data['user_type']

    db.session.commit()

    return jsonify({'user': user.to_dict(include_sensitive=True)})


# ── Модерация (P2b) ──
@admin_bp.route('/stats', methods=['GET'])
@admin_required
def moderation_stats():
    pending_orgs = db.session.query(db.func.count(Org.id)).filter(Org.verified.is_(False)).scalar() or 0
    open_reports = db.session.query(db.func.count(Report.id)).filter(Report.status != 'resolved').scalar() or 0
    return jsonify({'pendingOrgs': pending_orgs, 'openReports': open_reports})


@admin_bp.route('/orgs', methods=['GET'])
@admin_required
def admin_orgs():
    status = request.args.get('status', 'pending')
    q = Org.query
    if status == 'pending':
        q = q.filter(Org.verified.is_(False))
    return jsonify({'orgs': [serialize_org(o) for o in q.all()]})


@admin_bp.route('/orgs/<int:oid>/approve', methods=['POST'])
@admin_required
def approve_org(oid):
    org = db.session.get(Org, oid)
    if org is None:
        return jsonify({'error': 'Организация не найдена'}), 404
    org.verified = True
    db.session.commit()
    return jsonify({'org': serialize_org(org)})


@admin_bp.route('/orgs/<int:oid>/reject', methods=['POST'])
@admin_required
def reject_org(oid):
    org = db.session.get(Org, oid)
    if org is None:
        return jsonify({'error': 'Организация не найдена'}), 404
    org.verified = False
    db.session.commit()
    return jsonify({'ok': True})


@admin_bp.route('/reports', methods=['GET'])
@admin_required
def admin_reports():
    rows = Report.query.order_by(Report.created_at.desc()).all()
    return jsonify({'reports': [r.to_dict() for r in rows]})


@admin_bp.route('/reports/<int:rid>/review', methods=['POST'])
@admin_required
def review_report(rid):
    r = db.session.get(Report, rid)
    if r is None:
        return jsonify({'error': 'Жалоба не найдена'}), 404
    r.status = 'reviewing'
    db.session.commit()
    return jsonify({'report': r.to_dict()})


@admin_bp.route('/reports/<int:rid>/resolve', methods=['POST'])
@admin_required
def resolve_report(rid):
    r = db.session.get(Report, rid)
    if r is None:
        return jsonify({'error': 'Жалоба не найдена'}), 404
    from flask_jwt_extended import get_jwt_identity
    r.status = 'resolved'
    try:
        r.resolved_by = int(get_jwt_identity())
    except (TypeError, ValueError):
        pass
    db.session.commit()
    return jsonify({'report': r.to_dict()})
