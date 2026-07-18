"""P1: уведомления пользователя (лента, счётчик непрочитанного, отметка прочтения)."""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g

from models import db, Notification
from services.notifications import unread_count
from utils.decorators import profiled_required

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/notifications', methods=['GET'])
@profiled_required
def list_notifications():
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(int(request.args.get('per_page', 30)), 100)
    q = (Notification.query
         .filter_by(user_id=g.user.id)
         .order_by(Notification.created_at.desc()))
    pagination = q.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        'notifications': [n.to_dict() for n in pagination.items],
        'unread': unread_count(g.user.id),
        'page': pagination.page,
        'pages': pagination.pages,
    })


@notifications_bp.route('/notifications/unread-count', methods=['GET'])
@profiled_required
def get_unread_count():
    return jsonify({'count': unread_count(g.user.id)})


@notifications_bp.route('/notifications/<int:nid>/read', methods=['POST'])
@profiled_required
def read_one(nid):
    n = db.session.get(Notification, nid)
    if n is None or n.user_id != g.user.id:
        return jsonify({'error': 'Уведомление не найдено'}), 404
    if not n.read:
        n.read = True
        n.read_at = datetime.now(timezone.utc)
        db.session.commit()
    return jsonify({'unread': unread_count(g.user.id)})


@notifications_bp.route('/notifications/read-all', methods=['POST'])
@profiled_required
def read_all():
    now = datetime.now(timezone.utc)
    (Notification.query
     .filter_by(user_id=g.user.id, read=False)
     .update({'read': True, 'read_at': now}))
    db.session.commit()
    return jsonify({'unread': 0})
