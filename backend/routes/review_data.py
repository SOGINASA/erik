import json
from flask import Blueprint, request, jsonify, g, Response, current_app
from models import db, ReviewSubmission
from services.application_data import (validate_request, SOURCES, latest_submission, capture, ReviewVersionConflict)
from services.review_schema import KINDS, validate_details
from services.review_export import schema_manifest, dataset_stats, export_rows
from utils.decorators import admin_required, profiled_required

review_data_bp = Blueprint('review_data', __name__)


@review_data_bp.app_errorhandler(ReviewVersionConflict)
def stale_review(exc):
    db.session.rollback()
    return jsonify({'error': str(exc)}), 409


@review_data_bp.before_app_request
def validate_application_metadata():
    try:
        validate_request()
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400


def _owned_source(kind, id):
    for model, (source_kind, user_field, status_field, _) in SOURCES.items():
        if source_kind == kind:
            row = model.query.filter_by(id=id).with_for_update().first()
            if row is not None and getattr(row, user_field) == g.user.id:
                editable_statuses = ('pending', 'rejected') if kind == 'gathering' else ('open', 'reviewing') if kind == 'report' else ('pending',)
                return row, getattr(row, status_field) in editable_statuses
    return None, False


@review_data_bp.route('/application-data/<kind>/<int:id>', methods=['GET', 'PATCH'])
@profiled_required
def edit_details(kind, id):
    if kind not in KINDS:
        return jsonify({'error': 'Неизвестный вид заявки'}), 404
    row, editable = _owned_source(kind, id)
    if row is None:
        return jsonify({'error': 'Заявка не найдена'}), 404
    previous = latest_submission(kind, id)
    if request.method == 'GET':
        return jsonify({'applicationDetails': previous.details if previous else {'formVersion': 1, 'answers': {}}, 'editable': editable})
    # An already approved gathering's status is 'open'; descriptions can be edited
    # through the existing owner flow, but application-only answers stay frozen.
    if not editable or (kind == 'gathering' and row.status not in ('pending', 'rejected')):
        return jsonify({'error': 'Дополнить можно только заявку на рассмотрении'}), 409
    try:
        details = validate_details((request.get_json(silent=True) or {}).get('applicationDetails'), kind)
    except (ValueError, AttributeError) as exc:
        return jsonify({'error': str(exc)}), 400
    capture(row, details=details, origin='live')
    db.session.commit()
    return jsonify({'applicationDetails': details, 'editable': True})


@review_data_bp.get('/admin/application-data/schema')
@admin_required
def schema():
    return jsonify(schema_manifest())


@review_data_bp.get('/admin/application-data/stats')
@admin_required
def stats():
    return jsonify(dataset_stats())


@review_data_bp.get('/admin/application-data/<kind>/<int:id>/history')
@profiled_required
def history(kind, id):
    from models import ReviewDecision, Gathering, GatheringCoordinator, Application, UniversityMembership, University
    from services.universities import can_manage
    allowed = g.user.user_type == 'admin'
    if kind == 'event_participation':
        source = db.session.get(Application, id)
        gathering = db.session.get(Gathering, source.gathering_id) if source else None
        allowed = allowed or bool(gathering and (gathering.owner_id == g.user.id or GatheringCoordinator.query.filter_by(gathering_id=gathering.id, user_id=g.user.id).first()))
    if kind == 'university_membership':
        source = db.session.get(UniversityMembership, id)
        allowed = allowed or bool(source and can_manage(db.session.get(University, source.university_id), g.user))
    if not allowed:
        return jsonify({'error': 'История доступна только проверяющим этой заявки'}), 403
    rows = ReviewSubmission.query.filter_by(kind=kind, source_id=id).order_by(ReviewSubmission.revision).all()
    return jsonify({'submissions': [{'revision': row.revision, 'details': row.details, 'snapshot': row.snapshot,
        'submittedAt': row.submitted_at.isoformat(), 'origin': row.origin,
        'decisions': [{'outcome': d.outcome, 'reasonCode': d.reason_code, 'certainty': d.certainty,
                       'checks': d.checks, 'note': d.note, 'actorType': d.actor_type, 'decidedAt': d.decided_at.isoformat()}
                      for d in ReviewDecision.query.filter_by(submission_id=row.id).order_by(ReviewDecision.id)]} for row in rows]})


@review_data_bp.get('/admin/application-data/export')
@admin_required
def export():
    kind = request.args.get('kind') or None
    if kind is not None and kind not in KINDS:
        return jsonify({'error': 'Неизвестный вид заявки'}), 400
    secret = current_app.config.get('APPLICATION_DATA_EXPORT_KEY', '')
    if len(secret) < 32:
        return jsonify({'error': 'Выгрузка ещё не настроена: задайте APPLICATION_DATA_EXPORT_KEY на сервере'}), 503
    rows = export_rows(secret, kind=kind, training_only=request.args.get('trainingOnly') == '1')
    # Web export always omits private text. Explicit private text export is CLI-only.
    data = '\n'.join(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in rows) + '\n'
    return Response(data, mimetype='application/x-ndjson', headers={
        'Content-Disposition': 'attachment; filename="application-data-v1.jsonl"',
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})
