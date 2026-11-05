"""Shared university boundary for every event registration path."""
from flask import jsonify
from models import University, UniversityMembership, db


def can_manage(university, user):
    return bool(user and user.is_active and university and (
        user.user_type == 'admin' or (university.manager_id == user.id and user.role in ('coord', 'org'))))


def is_member(university_id, user):
    return bool(user and user.is_active and UniversityMembership.query.filter_by(
        university_id=university_id, user_id=user.id, status='approved').first())


def registration_error(gathering, user):
    if gathering.university_id and not is_member(gathering.university_id, user):
        return jsonify({'error': 'Сначала вступите в университет и дождитесь одобрения заявки',
                        'universityId': gathering.university_id}), 403
    return None


def serialize_membership(row):
    if row is None:
        return None
    return {'id': row.id, 'userId': row.user_id, 'fullName': row.full_name,
            'verificationMethod': row.verification_method, 'hasStudentCard': bool(row.student_card),
            'phone': row.phone, 'status': row.status, 'rejectionReason': row.rejection_reason,
            'createdAt': row.created_at.isoformat(),
            'decidedAt': row.decided_at.isoformat() if row.decided_at else None}
