"""NKO admission to the platform, not state registration of a legal entity."""
import re
from datetime import datetime, timezone
from flask import jsonify
from sqlalchemy.exc import IntegrityError
from models import db, Org, OrgApplication, User, City, Theme, RoleRequest


def serialize_application(row):
    return {'id': row.id, 'userId': row.user_id, 'data': row.data,
            'status': row.status, 'orgId': row.org_id,
            'reason': row.review_note if row.status == 'rejected' else None,
            'createdAt': row.created_at.isoformat(),
            'decidedAt': row.decided_at.isoformat() if row.decided_at else None}


def validate_application(data):
    if not isinstance(data, dict):
        raise ValueError('Заполните заявку организации')
    fields = {'legalName': (200, 'Полное наименование'), 'legalForm': (100, 'Правовая форма'),
              'bin': (12, 'БИН'), 'legalAddress': (500, 'Юридический адрес'),
              'representativeName': (150, 'ФИО представителя'),
              'authority': (500, 'Основание полномочий'),
              'email': (254, 'Email представителя'), 'phone': (32, 'Телефон представителя'),
              'aboutRu': (2000, 'Деятельность организации'),
              'publicContact': (300, 'Публичный контакт организации'),
              'cityId': (3, 'Город')}
    result = {}
    for key, (limit, label) in fields.items():
        value = data.get(key)
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
            raise ValueError(f'{label}: заполните поле (до {limit} символов)')
        result[key] = value.strip()
    if not re.fullmatch(r'[0-9]{12}', result['bin']):
        raise ValueError('БИН должен содержать 12 цифр')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', result['email']):
        raise ValueError('Укажите действительный email')
    if not re.fullmatch(r'\+?[0-9 ()-]{7,32}', result['phone']) or not 7 <= len(re.sub(r'\D', '', result['phone'])) <= 15:
        raise ValueError('Укажите телефон с кодом страны')
    if db.session.get(City, result['cityId']) is None:
        raise ValueError('Выберите город из списка')
    cat = data.get('cat') or None
    if cat is not None and (not isinstance(cat, str) or db.session.get(Theme, cat) is None):
        raise ValueError('Выберите направление из списка')
    if data.get('dataConsent') is not True:
        raise ValueError('Подтвердите согласие на обработку сведений заявки')
    if data.get('authorityConfirmed') is not True:
        raise ValueError('Подтвердите достоверность сведений и полномочия представителя')
    result.update(cat=cat, authorityConfirmed=True, dataConsent=True, declarationVersion='nko-2026-11-05')
    return result


def submit_application(user, data):
    try:
        data = validate_application(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    if Org.query.filter(db.or_(Org.bin == data['bin'], Org.owner_id == user.id)).first():
        return jsonify({'error': 'Организация уже зарегистрирована. Откройте её кабинет или обратитесь к администратору.'}), 409
    row = OrgApplication(user_id=user.id, pending_user_id=user.id, pending_bin=data['bin'], data=data)
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Заявка от вашего аккаунта или с этим БИН уже на проверке'}), 409
    return jsonify({'application': serialize_application(row)}), 201


def decide_application(aid, admin, data):
    if not isinstance(data, dict) or data.get('decision') not in ('approved', 'rejected'):
        return jsonify({'error': 'Укажите решение'}), 400
    decision = data['decision']
    if decision == 'approved' and (data.get('registryChecked') is not True or data.get('authorityChecked') is not True):
        return jsonify({'error': 'Подтвердите проверку регистрации и полномочий представителя'}), 400
    note = data.get('note')
    if not isinstance(note, str) or not 10 <= len(note.strip()) <= 2000:
        return jsonify({'error': 'Укажите результат проверки или причину отказа (10–2000 символов)'}), 400
    row = db.session.get(OrgApplication, aid)
    if row is None:
        return jsonify({'error': 'Заявка не найдена'}), 404
    # Conditional write claims the decision on SQLite as well as PostgreSQL.
    claimed = OrgApplication.query.filter_by(id=aid, status='pending').update(
        {'status': decision, 'pending_user_id': None, 'pending_bin': None}, synchronize_session=False)
    if not claimed:
        db.session.rollback()
        return jsonify({'error': 'Заявка уже рассмотрена. Обновите список.'}), 409
    db.session.refresh(row)
    owner = User.query.filter_by(id=row.user_id).with_for_update().first()
    if owner is None or not owner.is_active:
        db.session.rollback()
        return jsonify({'error': 'Аккаунт заявителя недоступен'}), 409
    row.review_note = note.strip()
    row.decided_by = admin.id
    row.decided_at = datetime.now(timezone.utc)
    if decision == 'approved':
        if Org.query.filter_by(owner_id=owner.id).first():
            db.session.rollback()
            return jsonify({'error': 'У заявителя уже есть организация'}), 409
        d = row.data
        org = Org(name=d['legalName'], bin=d['bin'],
                  registration={'legalName': d['legalName'], 'legalForm': d['legalForm']},
                  city_id=d['cityId'], cat=d['cat'], about_ru=d['aboutRu'],
                  contacts={'general': d['publicContact']}, owner_id=owner.id, verified=True)
        db.session.add(org)
        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            return jsonify({'error': 'Организация с этим БИН уже зарегистрирована'}), 409
        row.org_id = org.id
        owner.role = 'org'
        # Organization approval also establishes the representative's organizer status.
        # Close older requests so a later coordinator approval cannot downgrade it.
        for pending in RoleRequest.query.filter_by(user_id=owner.id, status='pending').all():
            pending.status = 'approved'
            pending.decided_by = admin.id
            pending.decided_at = row.decided_at
    from services.notifications import create_notification
    from services.application_data import record_decision
    # The conditional SQL UPDATE above intentionally bypasses ORM history.
    record_decision(row, decision)
    if decision == 'approved':
        create_notification(owner.id, 'org', 'Ваша НКО одобрена. Страница создана, кабинет доступен в разделе «НКО».', 'КЕҰ мақұлданды. Ұйым беті жасалды, кабинет «КЕҰ» бөлімінде қолжетімді.')
    else:
        create_notification(owner.id, 'org', 'Заявка НКО отклонена. Причина и повторная подача доступны в кабинете НКО.', 'КЕҰ өтінімі қабылданбады. Себебі мен қайта жіберу мүмкіндігі КЕҰ кабинетінде көрсетілген.')
    db.session.commit()
    return jsonify({'application': serialize_application(row)})
