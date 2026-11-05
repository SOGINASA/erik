"""University catalog, private student cards and moderated membership."""
import base64
import binascii
import re
from datetime import datetime, timezone
from uuid import UUID
from flask import Blueprint, request, jsonify, g, Response, current_app
from flask_jwt_extended import jwt_required
from models import db, University, UniversityMembership, User, Gathering, Notification
from services.identity import current_user
from services.universities import can_manage, serialize_membership
from utils.decorators import profiled_required, admin_required, rate_limit
from utils.serializers import serialize_event_card

universities_bp = Blueprint('universities', __name__)


def _serialize(row, user, counts=None, memberships=None):
    membership = (memberships.get(row.id) if memberships is not None else
        UniversityMembership.query.filter_by(university_id=row.id, user_id=user.id).first()) if user else None
    return {'id': row.id, 'name': row.name, 'nameKz': row.name_kz or row.name,
            'city': row.city, 'about': row.about or '', 'website': row.website or '',
            'microsoftEnabled': bool(row.microsoft_tenant_id and row.email_domains and
                current_app.config.get('MICROSOFT_CLIENT_ID') and current_app.config.get('MICROSOFT_CLIENT_SECRET') and
                current_app.config.get('MICROSOFT_REDIRECT_URI')),
            'microsoftTenantId': row.microsoft_tenant_id if can_manage(row, user) else None,
            'emailDomains': row.email_domains or [],
            'managerId': row.manager_id if can_manage(row, user) else None,
            'canManage': can_manage(row, user), 'membership': serialize_membership(membership),
            'eventsCount': (counts or {}).get(row.id, 0)}


@universities_bp.get('/universities')
@jwt_required(optional=True)
def catalog():
    user = current_user()
    memberships = {row.university_id: row for row in UniversityMembership.query.filter_by(user_id=user.id).all()} if user else {}
    counts = dict(db.session.query(Gathering.university_id, db.func.count(Gathering.id)).filter(
        Gathering.status == 'open', Gathering.university_id.isnot(None)).group_by(Gathering.university_id).all())
    return jsonify({'universities': [_serialize(row, user, counts, memberships) for row in University.query.order_by(University.name).all()]})


@universities_bp.get('/universities/<int:id>')
@jwt_required(optional=True)
def detail(id):
    row = db.session.get(University, id)
    if row is None:
        return jsonify({'error': 'Университет не найден'}), 404
    user = current_user()
    events = Gathering.query.filter_by(university_id=id, status='open').order_by(Gathering.starts_at, Gathering.id).all()
    return jsonify({'university': _serialize(row, user, {id: len(events)}),
                    'events': [serialize_event_card(event, user.id if user else None) for event in events]})


def _fields(body):
    if not isinstance(body, dict):
        return None, 'Ожидается JSON-объект'
    fields = {}
    for key, column, limit in [('name', 'name', 300), ('nameKz', 'name_kz', 300),
                                ('city', 'city', 100), ('about', 'about', 2000), ('website', 'website', 300)]:
        value = body.get(key, '')
        if not isinstance(value, str) or len(value.strip()) > limit:
            return None, f'Некорректное поле {key}'
        fields[column] = value.strip()
    if not fields['name'] or not fields['city']:
        return None, 'Укажите название и город'
    if fields['website'] and not fields['website'].startswith(('https://', 'http://')):
        return None, 'Сайт должен быть http(s)-ссылкой'
    manager_id = body.get('managerId')
    if manager_id not in (None, ''):
        if type(manager_id) is not int:
            return None, 'ID координатора должен быть целым числом'
        manager = db.session.get(User, manager_id)
        if manager is None or not manager.is_active or manager.role not in ('coord', 'org'):
            return None, 'Назначьте активного пользователя с ролью координатора или НКО'
    fields['manager_id'] = manager_id or None
    tenant = body.get('microsoftTenantId', '')
    domains = body.get('emailDomains', [])
    if not isinstance(tenant, str) or not isinstance(domains, list) or len(domains) > 20:
        return None, 'Укажите Tenant ID и список почтовых доменов'
    try:
        fields['microsoft_tenant_id'] = str(UUID(tenant)) if tenant else None
    except ValueError:
        return None, 'Tenant ID должен быть UUID каталога Microsoft Entra университета'
    if any(not isinstance(domain, str) or not re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}', domain) for domain in domains):
        return None, 'Некорректный почтовый домен'
    fields['email_domains'] = sorted(set(domain.lower() for domain in domains))
    return fields, None


@universities_bp.route('/universities', methods=['POST'])
@universities_bp.route('/universities/<int:id>', methods=['PUT'])
@admin_required
def save(id=None):
    fields, error = _fields(request.get_json(silent=True))
    if error:
        return jsonify({'error': error}), 400
    row = db.session.get(University, id) if id else University()
    if row is None:
        return jsonify({'error': 'Университет не найден'}), 404
    duplicate = University.query.filter_by(name=fields['name']).first()
    if duplicate and duplicate.id != id:
        return jsonify({'error': 'Университет с таким названием уже существует'}), 409
    for key, value in fields.items():
        setattr(row, key, value)
    db.session.add(row)
    db.session.commit()
    return jsonify({'university': _serialize(row, g.user)}), 200 if id else 201


def _decode_card(value):
    if not isinstance(value, str) or len(value) > 7 * 1024 * 1024:
        return None, None
    try:
        raw = base64.b64decode(value.split(',', 1)[1], validate=True)
    except (ValueError, IndexError, binascii.Error):
        return None, None
    mime = None
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif raw.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    elif raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
        mime = 'image/webp'
    return (raw, mime) if mime and len(raw) <= 5 * 1024 * 1024 else (None, None)


@universities_bp.post('/universities/<int:id>/membership')
@profiled_required
@rate_limit(10, 3600, by_user=True)
def join(id):
    request.max_content_length = 7 * 1024 * 1024
    university = db.session.get(University, id)
    if university is None:
        return jsonify({'error': 'Университет не найден'}), 404
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({'error': 'Ожидается JSON-объект'}), 400
    name, phone = body.get('fullName'), body.get('phone')
    if not isinstance(name, str) or not 3 <= len(name.strip()) <= 100 or len(name.split()) < 2:
        return jsonify({'error': 'Укажите полные фамилию и имя (до 100 символов)'}), 400
    if not isinstance(phone, str) or len(phone) > 32 or not re.fullmatch(r'[+\d\s()\-]+', phone) or not 10 <= len(re.sub(r'\D', '', phone)) <= 15:
        return jsonify({'error': 'Укажите корректный номер телефона'}), 400
    if body.get('consent') is not True:
        return jsonify({'error': 'Подтвердите передачу данных для проверки студенческого статуса'}), 400
    raw, mime = _decode_card(body.get('studentCard'))
    if raw is None:
        return jsonify({'error': 'Прикрепите фото студбилета: PNG, JPEG или WebP до 5 МБ'}), 400
    # Serialize concurrent submissions from the same student.
    User.query.filter_by(id=g.user.id).with_for_update().one()
    row = UniversityMembership.query.filter_by(university_id=id, user_id=g.user.id).first()
    if row and row.status in ('pending', 'approved'):
        return jsonify({'error': 'Заявка уже отправлена или одобрена'}), 409
    if row is None:
        row = UniversityMembership(university_id=id, user_id=g.user.id)
        db.session.add(row)
    row.full_name, row.phone = name.strip(), phone.strip()
    row.verification_method, row.microsoft_oid, row.verified_email = 'student_card', None, None
    row.student_card, row.student_card_mime = raw, mime
    row.status, row.rejection_reason, row.decided_at, row.decided_by = 'pending', None, None, None
    row.created_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'membership': serialize_membership(row)}), 201


@universities_bp.get('/universities/<int:id>/memberships')
@profiled_required
def memberships(id):
    if not can_manage(db.session.get(University, id), g.user):
        return jsonify({'error': 'Требуются права координатора университета'}), 403
    rows = UniversityMembership.query.filter_by(university_id=id).order_by(UniversityMembership.created_at.desc()).all()
    return jsonify({'memberships': [serialize_membership(row) for row in rows]})


@universities_bp.get('/university-memberships/<int:id>/student-card')
@profiled_required
def student_card(id):
    row = db.session.get(UniversityMembership, id)
    if row is None:
        return jsonify({'error': 'Заявка не найдена'}), 404
    if row.user_id != g.user.id and not can_manage(db.session.get(University, row.university_id), g.user):
        return jsonify({'error': 'Нет доступа к студбилету'}), 403
    if not row.student_card:
        return jsonify({'error': 'Студбилет не прикреплён: подтверждение через Microsoft'}), 404
    return Response(row.student_card, mimetype=row.student_card_mime, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@universities_bp.post('/university-memberships/<int:id>/decision')
@profiled_required
def decide(id):
    row = UniversityMembership.query.filter_by(id=id).with_for_update().first()
    if row is None:
        return jsonify({'error': 'Заявка не найдена'}), 404
    university = db.session.get(University, row.university_id)
    if not can_manage(university, g.user):
        return jsonify({'error': 'Требуются права координатора университета'}), 403
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or body.get('status') not in ('approved', 'rejected'):
        return jsonify({'error': 'Выберите approved или rejected'}), 400
    reason = body.get('reason', '')
    if not isinstance(reason, str) or len(reason) > 400 or (body['status'] == 'rejected' and not reason.strip()):
        return jsonify({'error': 'Укажите причину отклонения до 400 символов'}), 400
    if row.status != 'pending':
        return jsonify({'error': 'Заявка уже рассмотрена'}), 409
    row.status, row.rejection_reason = body['status'], reason.strip() if body['status'] == 'rejected' else None
    row.decided_at, row.decided_by = datetime.now(timezone.utc), g.user.id
    db.session.add(Notification(user_id=row.user_id, type='system',
        text_ru=(f'{university.name}: ' + ('заявка одобрена' if row.status == 'approved' else f'заявка отклонена: {reason.strip()}'))[:300],
        text_kz=(f'{university.name}: ' + ('өтінім мақұлданды' if row.status == 'approved' else f'өтінім қабылданбады: {reason.strip()}'))[:300]))
    db.session.commit()
    return jsonify({'membership': serialize_membership(row)})
