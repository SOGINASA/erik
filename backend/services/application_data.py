"""Transactional capture for every supported application, including indirect flows.

Only SQLAlchemy's unit of work is observed: evidence is committed/rolled back with
the source row. No after-commit writes, mutable labels, or model-generated truth.
"""
import copy
import hashlib
import json
from datetime import datetime, timezone

from flask import g, has_request_context, request
from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from models import (db, Gathering, GatheringRole, RoleRequest, OrgApplication, UniversityMembership,
                    Application, Report, Org, User, ReviewSubmission, ReviewDecision)
from services.review_schema import validate_details, validate_review

SOURCES = {
    Gathering: ('gathering', 'owner_id', 'status', {'open': 'approved', 'rejected': 'rejected'}),
    RoleRequest: ('organizer_role', 'user_id', 'status', {'approved': 'approved', 'declined': 'rejected'}),
    OrgApplication: ('organization', 'user_id', 'status', {'approved': 'approved', 'rejected': 'rejected'}),
    UniversityMembership: ('university_membership', 'user_id', 'status', {'approved': 'approved', 'rejected': 'rejected'}),
    Application: ('event_participation', 'applicant_id', 'status', {'accepted': 'approved', 'declined': 'rejected'}),
    Report: ('report', 'reporter_id', 'status', {'resolved': 'resolved_unclassified'}),
    Org: ('legacy_organization', 'owner_id', 'verified', {True: 'approved'}),
}
SUBMIT_ENDPOINTS = {'gatherings.create_gathering': 'gathering', 'gatherings.update_gathering': 'gathering',
    'gatherings.resubmit_gathering': 'gathering', 'platform.create_role_request': 'organizer_role',
    'platform.create_org': 'organization', 'universities.join': 'university_membership',
    'organizer.create_application': 'event_participation', 'platform.create_report': 'report',
    'review_data.edit_details': None, 'auth.register': 'organizer_role'}
HUMAN_ENDPOINTS = {
    'admin.approve_event': 'gathering', 'admin.reject_event': 'gathering',
    'admin.approve_role_request': 'organizer_role', 'admin.reject_role_request': 'organizer_role',
    'admin.org_application_decision': 'organization', 'admin.approve_org': 'legacy_organization',
    'admin.reject_org': 'legacy_organization', 'universities.decide': 'university_membership',
    'organizer.accept_application': 'event_participation', 'organizer.decline_application': 'event_participation',
    'organizer.bulk_applications': 'event_participation', 'admin.resolve_report': 'report',
}


class ReviewVersionConflict(Exception):
    pass


def validate_request():
    """Called before mutation; old clients stay supported but unannotated decisions
    are explicitly ineligible for training. Unknown schemas never enter the log.
    """
    if request.method not in ('POST', 'PUT', 'PATCH'):
        return
    if request.endpoint not in SUBMIT_ENDPOINTS and request.endpoint not in HUMAN_ENDPOINTS:
        return
    if request.endpoint == 'universities.join':
        request.max_content_length = 7 * 1024 * 1024
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return
    if 'applicationDetails' in body:
        if request.endpoint not in SUBMIT_ENDPOINTS:
            raise ValueError('Анкету нельзя менять при принятии решения')
        kind = SUBMIT_ENDPOINTS[request.endpoint]
        g.application_details = validate_details(body['applicationDetails'], kind)
    if 'review' in body:
        if request.endpoint not in HUMAN_ENDPOINTS:
            raise ValueError('Разметку решения может передавать только проверяющий')
        g.review_annotation = validate_review(body['review'])


def latest_submission(kind, source_id):
    pending = [row for row in db.session.new if isinstance(row, ReviewSubmission) and row.kind == kind and row.source_id == source_id]
    if pending:
        return max(pending, key=lambda row: row.revision)
    return ReviewSubmission.query.filter_by(kind=kind, source_id=source_id).order_by(ReviewSubmission.revision.desc()).first()


def _iso(value):
    if not value:
        return None
    return value.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z') if value.tzinfo is None else value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def _snapshot(row, kind):
    if kind == 'gathering':
        return {'title': row.title_ru, 'title_kz': row.title_kz, 'place': row.place_ru,
                'starts_at': _iso(row.starts_at), 'theme': row.theme, 'city_id': row.city_id,
                'format': row.format, 'needed': row.needed, 'has_cover': bool(row.image_url),
                'has_organization': bool(row.org_id), 'university_id': row.university_id,
                'roles': [{'title': r.title_ru, 'capacity': r.capacity, 'newbie': r.newbie} for r in GatheringRole.query.filter_by(gathering_id=row.id).order_by(GatheringRole.sort, GatheringRole.id)]}
    if kind == 'organizer_role':
        return {'requested_role': row.requested_role, 'message': row.message}
    if kind == 'organization':
        data = row.data or {}
        return {**{key: data.get(key) for key in ('legalName', 'legalForm', 'cityId', 'cat', 'aboutRu', 'authorityConfirmed', 'dataConsent')},
                **{f'has_{key}': bool(data.get(key)) for key in ('bin', 'legalAddress', 'representativeName', 'authority', 'email', 'phone', 'publicContact')}}
    if kind == 'university_membership':
        return {'university_id': row.university_id, 'has_full_name': bool(row.full_name), 'has_phone': bool(row.phone),
                'has_student_card': bool(row.student_card), 'document_mime': row.student_card_mime,
                'document_bytes': len(row.student_card) if row.student_card else 0,
                'verification_method': row.verification_method}
    if kind == 'event_participation':
        gathering = db.session.get(Gathering, row.gathering_id)
        return {'skills': row.skills or [], 'message': row.message,
                'event': _snapshot(gathering, 'gathering') if gathering else None}
    if kind == 'report':
        reason = row.reason
        if has_request_context() and request.endpoint == 'platform.create_report':
            body = request.get_json(silent=True) or {}
            reason = body.get('reason') or body.get('text') or reason
        return {'target_type': row.target_type, 'target_id': row.target_id, 'reason': reason}
    return {'name': row.name, 'city_id': row.city_id, 'category': row.cat, 'about': row.about_ru,
            'has_contacts': bool(row.contacts)}


def capture(row, *, new=False, resubmitted=False, details=None, origin=None):
    kind, applicant_field, *_ = SOURCES[type(row)]
    applicant_id = getattr(row, applicant_field)
    snapshot = _snapshot(row, kind)
    previous = latest_submission(kind, row.id)
    if kind == 'event_participation' and previous and not (has_request_context() and request.endpoint in ('organizer.create_application', 'review_data.edit_details')):
        # Requirements belong to the application-time context, not to the current
        # event. An organizer editing an event must not rewrite old examples.
        snapshot['event'] = previous.snapshot.get('event')
    if kind == 'report' and previous and not (has_request_context() and request.endpoint == 'platform.create_report'):
        # Aggregated Report rows retain the first complaint text; use the last
        # captured complaint and its versioned history instead of relabeling it.
        snapshot = previous.snapshot
    if details is None:
        details = previous.details if previous else {'formVersion': 1, 'answers': {}}
        if has_request_context() and SUBMIT_ENDPOINTS.get(request.endpoint, 'unmatched') in (kind, None):
            details = getattr(g, 'application_details', details)
    # Frozen JSON copies avoid ORM aliases or later source edits mutating evidence.
    snapshot, details = copy.deepcopy(snapshot), copy.deepcopy(details)
    digest = hashlib.sha256(json.dumps([snapshot, details, applicant_id], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if previous and previous.input_digest == digest and not resubmitted:
        return previous
    user = db.session.get(User, applicant_id) if applicant_id else None
    context = {'role': user.role, 'city_id': user.city_id, 'events_attended': user.events_attended or 0,
               'hours_total': user.hours_total or 0, 'trust_came': user.trust_came or 0,
               'trust_total': user.trust_total or 0} if user else {}
    now = datetime.now(timezone.utc)
    if origin is None:
        origin = 'live' if has_request_context() and (new or previous or resubmitted) else 'legacy'
        if user and (user.device_id or '').startswith('demo-'):
            origin = 'demo'
    submission = ReviewSubmission(kind=kind, source_id=row.id, revision=(previous.revision + 1 if previous else 1),
        applicant_id=applicant_id, origin=origin, input_digest=digest, snapshot=snapshot, details=details,
        applicant_context=context, submitted_at=(getattr(row, 'created_at', None) or now) if new else now,
        captured_at=now, schema_version=1, form_version=details['formVersion'])
    db.session.add(submission)
    return submission


def record_decision(row, outcome, *, actor_type=None):
    kind = SOURCES[type(row)][0]
    submission = capture(row)
    actor = getattr(g, 'user', None) if has_request_context() else None
    human = bool(actor and actor.is_active and HUMAN_ENDPOINTS.get(request.endpoint) == kind) if has_request_context() else False
    annotation = getattr(g, 'review_annotation', {}) if human else {}
    expected_revision = annotation.get('submissionRevision')
    if expected_revision is not None and expected_revision != submission.revision:
        raise ReviewVersionConflict('Заявка изменилась во время проверки. Обновите анкету и рассмотрите её заново.')
    if kind == 'report' and annotation.get('reportOutcome'):
        outcome = annotation['reportOutcome']
    note = annotation.get('note')
    if not note:
        note = getattr(row, 'reject_reason', None) or getattr(row, 'rejection_reason', None) or getattr(row, 'review_note', None)
    decision = ReviewDecision(submission=submission, outcome=outcome,
        actor_type=actor_type or ('human' if human else 'system'), reviewer_id=actor.id if human else None,
        reason_code=annotation.get('reasonCode', 'unspecified'), certainty=annotation.get('certainty', 'unrecorded'),
        checks=copy.deepcopy(annotation.get('checks', {})), note=(note or '')[:2000] or None,
        taxonomy_version=1, reviewed_revision=expected_revision)
    # An idempotent route or extra flush must never create extra labels.
    decisions = [d for d in db.session.new if isinstance(d, ReviewDecision) and d.submission is submission]
    existing = decisions[-1] if decisions else (ReviewDecision.query.filter_by(submission_id=submission.id).order_by(ReviewDecision.id.desc()).first() if submission.id else None)
    if existing and existing.outcome == outcome:
        return existing
    db.session.add(decision)
    return decision


@event.listens_for(Session, 'before_flush')
def _collect_changes(session, _context, _instances):
    changes = []
    for row in set(session.new) | set(session.dirty) | set(session.deleted):
        if isinstance(row, GatheringRole) and row.gathering_id:
            parent = session.get(Gathering, row.gathering_id)
            if parent:
                changes.append((parent, False, False, None))
            continue
        spec = SOURCES.get(type(row))
        if spec is None:
            continue
        kind, _, status_field, outcomes = spec
        if kind == 'legacy_organization' and (not has_request_context() or HUMAN_ENDPOINTS.get(request.endpoint) != kind):
            continue
        history = inspect(row).attrs[status_field].history
        outcome = outcomes.get(getattr(row, status_field)) if history.has_changes() else None
        resubmitted = bool(history.has_changes() and history.deleted and history.deleted[0] in ('rejected', 'declined') and getattr(row, status_field) == 'pending')
        if row in session.deleted:
            if kind == 'legacy_organization' and request.endpoint == 'admin.reject_org':
                # Capture before physical deletion; the evidence has no source FK.
                record_decision(row, 'rejected')
            continue
        changes.append((row, row in session.new, resubmitted, outcome))
    session.info['_review_changes'] = changes


@event.listens_for(Session, 'after_flush_postexec')
def _persist_changes(session, _context):
    for row, new, resubmitted, outcome in session.info.pop('_review_changes', []):
        session.refresh(row)
        capture(row, new=new, resubmitted=resubmitted)
        if outcome:
            record_decision(row, outcome)


@event.listens_for(Session, 'after_rollback')
def _clear_changes(session):
    session.info.pop('_review_changes', None)
