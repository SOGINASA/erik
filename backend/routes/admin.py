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


# ── Обзор / статистика (Overview) ──
@admin_bp.route('/stats', methods=['GET'])
@admin_required
def moderation_stats():
    """Метрики под карточки AdminOverview. pendingOrgs/openReports сохранены (обратная совместимость)."""
    from models import Gathering, CharityRequest

    pending_orgs = db.session.query(db.func.count(Org.id)).filter(Org.verified.is_(False)).scalar() or 0
    verified_orgs = db.session.query(db.func.count(Org.id)).filter(Org.verified.is_(True)).scalar() or 0
    open_reports = db.session.query(db.func.count(Report.id)).filter(Report.status != 'resolved').scalar() or 0

    users_total = db.session.query(db.func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0
    volunteers = db.session.query(db.func.count(User.id)).filter(
        User.is_active.is_(True), User.role == 'vol').scalar() or 0
    coordinators = db.session.query(db.func.count(User.id)).filter(
        User.is_active.is_(True), User.role == 'coord').scalar() or 0
    active_events = db.session.query(db.func.count(Gathering.id)).filter(
        Gathering.status == 'open').scalar() or 0
    hours_total = db.session.query(db.func.coalesce(db.func.sum(User.hours_total), 0)).scalar() or 0
    raised = db.session.query(db.func.coalesce(db.func.sum(CharityRequest.raised), 0)).filter(
        CharityRequest.kind == 'money').scalar() or 0
    avg_rel = db.session.query(db.func.avg(User.reliability)).filter(User.events_attended > 0).scalar()

    return jsonify({
        'pendingOrgs': pending_orgs,
        'openReports': open_reports,
        'verifiedOrgs': verified_orgs,
        'orgs': pending_orgs + verified_orgs,
        'users': users_total,
        'volunteers': volunteers,
        'coordinators': coordinators,
        'activeEvents': active_events,
        'hoursTotal': int(hours_total),
        'raised': int(raised),
        'avgReliability': int(round(avg_rel)) if avg_rel is not None else 0,
    })


@admin_bp.route('/analytics', methods=['GET'])
@admin_required
def admin_analytics():
    """Аналитика для AdminAnalytics: рост, явка, разрезы по городам/темам. Реальные данные вместо демо."""
    from models import Gathering, Participant, City, CharityRequest

    # явка: пришло / ответило 'yes'|'maybe'|'no' по завершённым сборам
    done_ids = [r[0] for r in db.session.query(Gathering.id).filter(
        db.or_(Gathering.status == 'done', Gathering.finalized_at.isnot(None))).all()]
    came = answered = 0
    if done_ids:
        came = db.session.query(db.func.count(Participant.id)).filter(
            Participant.gathering_id.in_(done_ids), Participant.presence == 'came').scalar() or 0
        answered = db.session.query(db.func.count(Participant.id)).filter(
            Participant.gathering_id.in_(done_ids),
            Participant.answer.in_(('yes', 'maybe', 'no'))).scalar() or 0
    attendance_rate = int(round(100 * came / answered)) if answered else 0

    # по городам
    by_city = []
    for c in City.query.all():
        active = db.session.query(db.func.count(Gathering.id)).filter(
            Gathering.city_id == c.id, Gathering.status == 'open').scalar() or 0
        vol = db.session.query(db.func.count(User.id)).filter(User.city_id == c.id).scalar() or 0
        by_city.append({'id': c.id, 'ru': c.name_ru, 'kz': c.name_kz, 'active': active, 'vol': vol})
    by_city.sort(key=lambda x: x['vol'], reverse=True)

    # по темам
    theme_rows = db.session.query(
        Gathering.theme, db.func.count(Gathering.id)).filter(
        Gathering.status != 'deleted', Gathering.theme.isnot(None)).group_by(Gathering.theme).all()
    by_theme = [{'theme': t, 'events': n} for t, n in theme_rows]
    by_theme.sort(key=lambda x: x['events'], reverse=True)

    # рост: новые пользователи по месяцам (реальные created_at, последние 6 месяцев)
    users = db.session.query(User.created_at).filter(User.created_at.isnot(None)).all()
    buckets = {}
    for (dt,) in users:
        key = dt.strftime('%Y-%m')
        buckets[key] = buckets.get(key, 0) + 1
    growth = [{'label': k, 'value': v} for k, v in sorted(buckets.items())][-6:]

    return jsonify({
        'attendanceRate': attendance_rate,
        'byCity': by_city,
        'byTheme': by_theme,
        'growth': growth,
    })


# ── Рассылки (Broadcast) ──
@admin_bp.route('/broadcast', methods=['POST'])
@admin_required
def broadcast():
    """Рассылка → Notification по сегменту (all|vol|coord|nko|city). Возвращает реальный reach."""
    from models import Notification

    data = request.get_json(silent=True) or {}
    segment = (data.get('segment') or data.get('audience') or 'all').strip()
    title = (data.get('title') or '').strip()
    body_ru = (data.get('textRu') or data.get('text_ru') or data.get('text') or '').strip()
    body_kz = (data.get('textKz') or data.get('text_kz') or body_ru).strip()
    city_id = data.get('cityId') or data.get('city_id') or data.get('city')

    def compose(t, b):
        s = (f'{t}. {b}' if (t and b) else (t or b)).strip()
        return s[:300] if s else None

    text_ru = compose(title, body_ru)
    text_kz = compose(title, body_kz)
    if not text_ru:
        return jsonify({'error': 'Пустое объявление'}), 400

    q = User.query.filter(User.is_active.is_(True))
    if segment == 'vol':
        q = q.filter(User.role == 'vol')
    elif segment == 'coord':
        q = q.filter(User.role == 'coord')
    elif segment == 'nko':
        q = q.filter(User.role == 'org')
    elif segment == 'city':
        if not city_id:
            return jsonify({'error': 'Укажите город для рассылки'}), 400
        q = q.filter(User.city_id == city_id)
    # 'all' — без доп. фильтра

    now = datetime.now(timezone.utc)
    recipients = q.all()
    for u in recipients:
        db.session.add(Notification(user_id=u.id, type='system',
                                    text_ru=text_ru, text_kz=text_kz, created_at=now))
    db.session.commit()
    return jsonify({'reach': len(recipients), 'segment': segment})


# ── События (модерация ленты) ──
def _admin_event(gathering, today):
    from utils.serializers import serialize_org_event
    d = serialize_org_event(gathering, 0, today)
    d['orgId'] = gathering.org_id
    d['ownerId'] = gathering.owner_id
    return d


@admin_bp.route('/events', methods=['GET'])
@admin_required
def admin_events():
    """Все события (кроме удалённых) для модерации. ?status=open|done фильтрует."""
    from models import Gathering

    status = request.args.get('status', 'all')
    q = Gathering.query.filter(Gathering.status != 'deleted')
    if status == 'open':
        q = q.filter(Gathering.status == 'open')
    elif status == 'done':
        q = q.filter(db.or_(Gathering.status == 'done', Gathering.finalized_at.isnot(None)))
    rows = q.order_by(Gathering.starts_at.desc()).all()
    today = datetime.now(timezone.utc).date()
    return jsonify({'events': [_admin_event(x, today) for x in rows]})


@admin_bp.route('/events/<int:eid>/unpublish', methods=['POST'])
@admin_required
def unpublish_event(eid):
    """Снять событие с публикации (убрать из ленты)."""
    from models import Gathering

    gathering = db.session.get(Gathering, eid)
    if gathering is None or gathering.status == 'deleted':
        return jsonify({'error': 'Событие не найдено'}), 404
    gathering.status = 'deleted'
    gathering.bump()
    db.session.commit()
    return jsonify({'ok': True, 'id': eid})


# ── Помощь (charity) ──
@admin_bp.route('/charity/<int:cid>/close', methods=['POST'])
@admin_required
def close_charity(cid):
    """Закрыть кампанию. Модель без статуса → отмечаем достигнутой (raised=goal)."""
    from models import CharityRequest

    c = db.session.get(CharityRequest, cid)
    if c is None:
        return jsonify({'error': 'Кампания не найдена'}), 404
    c.raised = c.goal
    db.session.commit()
    return jsonify({'ok': True, 'id': cid, 'raised': c.raised, 'goal': c.goal})


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
