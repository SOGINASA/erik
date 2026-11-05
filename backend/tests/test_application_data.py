import json
import pytest
from flask_jwt_extended import create_access_token
from models import db, User, Gathering, RoleRequest, ReviewSubmission, ReviewDecision
from services.review_export import export_rows, quality_issues
from services.review_schema import CHECKS

KEY = 'stable-export-key-for-tests-at-least-32-characters'


def headers(user):
    return {'Authorization': 'Bearer ' + create_access_token(identity=str(user.id))}


def details(kind='organizer_role'):
    from services.review_schema import INTAKE_FIELDS
    return {'formVersion': 1, 'answers': {key: 'Specific useful answer' for key in INTAKE_FIELDS[kind]}}


def annotation(kind='organizer_role', **patch):
    latest = ReviewSubmission.query.filter_by(kind=kind).order_by(ReviewSubmission.id.desc()).first()
    return {'reasonCode': 'complete_and_valid', 'certainty': 'certain',
            'submissionRevision': latest.revision if latest else None,
            'checks': {key: 'passed' for key in CHECKS[kind]}, 'note': 'Manually verified', **patch}


def submit_role(client, user):
    result = client.post('/api/me/role-request', headers=headers(user), json={
        'message': 'I can organize cleanups, email private@example.test, +77771234567', 'applicationDetails': details()})
    assert result.status_code == 201, result.get_json()
    return result.get_json()['request']['id']


def test_freezes_input_context_and_labels_separately(client, user1, admin_headers):
    user1.trust_total = 3; db.session.commit()
    rid = submit_role(client, user1)
    row = ReviewSubmission.query.filter_by(kind='organizer_role', source_id=rid).one()
    assert row.origin == 'live' and row.applicant_context['trust_total'] == 3
    original = row.snapshot.copy()
    user1.trust_total = 99; db.session.commit()
    response = client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers, json={'review': annotation()})
    assert response.status_code == 200
    assert ReviewSubmission.query.count() == 1
    decision = ReviewDecision.query.one()
    assert decision.actor_type == 'human' and decision.reason_code == 'complete_and_valid'
    assert row.snapshot == original and row.applicant_context['trust_total'] == 3
    exported = list(export_rows(KEY, training_only=True))
    assert len(exported) == 1 and exported[0]['label']['outcome'] == 'approved'
    assert exported[0]['features']['applicant.trust_total'] == 3
    serialized = json.dumps(exported)
    for private in ('private@example.test', '+77771234567', user1.full_name, 'Manually verified'):
        assert private not in serialized
    assert 'reasonCode' not in json.dumps(exported[0]['features'])
    assert client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers).status_code == 409
    assert ReviewDecision.query.count() == 1


def test_questionnaire_versions_are_immutable_and_owned(client, user1, user2, admin_headers):
    rid = submit_role(client, user1)
    original = ReviewSubmission.query.one()
    changed = details(); changed['answers']['motivation'] = 'An improved explanation'
    url = f'/api/application-data/organizer_role/{rid}'
    assert client.patch(url, headers=headers(user2), json={'applicationDetails': changed}).status_code == 404
    assert client.patch(url, headers=headers(user1), json={'applicationDetails': changed}).status_code == 200
    rows = ReviewSubmission.query.order_by(ReviewSubmission.revision).all()
    assert len(rows) == 2 and rows[0].details['answers']['motivation'] == 'Specific useful answer'
    assert rows[1].details['answers']['motivation'] == 'An improved explanation'
    assert client.patch(url, headers=headers(user1), json={'applicationDetails': changed}).status_code == 200
    assert ReviewSubmission.query.count() == 2
    assert client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers, json={'review': annotation()}).status_code == 200
    assert ReviewDecision.query.one().submission_id == rows[1].id
    assert client.patch(url, headers=headers(user1), json={'applicationDetails': details()}).status_code == 409
    rows[0].origin = 'tampered'
    with pytest.raises(ValueError, match='append-only'):
        db.session.commit()
    db.session.rollback()


def test_event_edits_and_resubmission_do_not_inherit_old_label(client, user1, admin_headers):
    user1.role = 'coord'; db.session.commit()
    response = client.post('/api/gatherings', headers=headers(user1), json={
        'what': 'Safe volunteer cleanup', 'where': 'Park', 'date': '2027-01-01', 'time': '10:00',
        'applicationDetails': details('gathering'), 'roles': [{'titleRu': 'Helper', 'capacity': 3}]})
    assert response.status_code == 201
    eid = response.get_json()['id']
    response = client.post(f'/api/admin/events/{eid}/reject', headers=admin_headers, json={
        'reason': 'Please clarify the plan', 'review': annotation('gathering', reasonCode='missing_details')})
    assert response.status_code == 200
    first_decision = ReviewDecision.query.filter_by(outcome='rejected').one()
    old_submission = first_decision.submission_id
    assert client.patch(f'/api/gatherings/{eid}', headers=headers(user1), json={'what': 'Improved volunteer cleanup'}).status_code == 200
    assert client.post(f'/api/gatherings/{eid}/resubmit', headers=headers(user1)).status_code == 200
    newest = ReviewSubmission.query.filter_by(kind='gathering').order_by(ReviewSubmission.revision.desc()).first()
    assert newest.id != old_submission
    assert ReviewDecision.query.filter_by(submission_id=newest.id).count() == 0
    count = ReviewSubmission.query.count()
    assert client.post(f'/api/admin/events/{eid}/approve', headers=admin_headers, json={'review': annotation('gathering')}).status_code == 200
    assert ReviewSubmission.query.count() == count  # SQLite timezone round trips are normalized.
    samples = list(export_rows(KEY, training_only=True))
    assert {s['label']['outcome'] for s in samples} == {'approved', 'rejected'}
    assert len({s['caseGroup'] for s in samples}) == 1


@pytest.mark.parametrize('review,issue', [
    ({}, 'missing_reason_code'),
    ({'certainty': 'needs_second_review'}, 'uncertain_decision'),
    ({'checks': {}}, 'incomplete_checks'),
    ({'checks': {key: 'failed' for key in CHECKS['organizer_role']}}, 'inconsistent_approval'),
])
def test_weak_or_uncertain_labels_are_explicitly_excluded(client, user1, admin_headers, review, issue):
    rid = submit_role(client, user1)
    body = {} if review == {} else {'review': annotation(**review)}
    assert client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers, json=body).status_code == 200
    example = list(export_rows(KEY))[0]
    assert issue in example['exclusionReasons'] and not example['trainingEligible']
    assert list(export_rows(KEY, training_only=True)) == []


def test_invalid_metadata_cannot_mutate_application_or_grant_role(client, user1, admin_headers):
    assert client.post('/api/me/role-request', headers=headers(user1), json={'applicationDetails': {'formVersion': 99, 'answers': {}}}).status_code == 400
    assert RoleRequest.query.count() == 0
    rid = submit_role(client, user1)
    assert client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers, json={'review': annotation(reasonCode='invented')}).status_code == 400
    assert db.session.get(User, user1.id).role == 'vol'
    assert ReviewDecision.query.count() == 0


def test_stale_review_rolls_back_role_grant(client, user1, admin_headers):
    rid = submit_role(client, user1)
    changed = details(); changed['answers']['experience'] = 'New experience added while reviewer was reading'
    assert client.patch(f'/api/application-data/organizer_role/{rid}', headers=headers(user1), json={'applicationDetails': changed}).status_code == 200
    response = client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers,
                           json={'review': annotation(submissionRevision=1)})
    assert response.status_code == 409
    assert db.session.get(User, user1.id).role == 'vol'
    assert db.session.get(RoleRequest, rid).status == 'pending'
    assert ReviewDecision.query.count() == 0


def test_export_permissions_filtering_and_stable_pseudonyms(client, app, user1, admin_headers, monkeypatch):
    rid = submit_role(client, user1)
    client.post(f'/api/admin/role-requests/{rid}/approve', headers=admin_headers, json={'review': annotation()})
    base = '/api/admin/application-data'
    assert client.get(base + '/stats', headers=headers(user1)).status_code == 403
    assert client.get(base + '/export', headers=admin_headers).status_code == 503
    monkeypatch.setitem(app.config, 'APPLICATION_DATA_EXPORT_KEY', KEY)
    response = client.get(base + '/export?trainingOnly=1', headers=admin_headers)
    assert response.status_code == 200 and response.headers['Cache-Control'] == 'private, no-store'
    examples = [json.loads(line) for line in response.get_data(as_text=True).splitlines() if line]
    assert len(examples) == 1
    assert examples == list(export_rows(KEY, training_only=True))
    stats = client.get(base + '/stats', headers=admin_headers).get_json()
    assert stats['trainingEligible'] == 1 and stats['decisions'] == 1
    assert client.get(base + '/export?kind=nonexistent', headers=admin_headers).status_code == 400


def test_rollback_erases_pending_evidence(app, user1):
    row = RoleRequest(user_id=user1.id, requested_role='coord', message='Not committed')
    db.session.add(row); db.session.flush()
    assert ReviewSubmission.query.count() == 1
    db.session.rollback()
    assert ReviewSubmission.query.count() == 0


def test_cli_backfill_and_export_do_not_invent_history(app, user1, tmp_path, monkeypatch):
    from services.review_cli import register_review_commands
    if 'export-application-data' not in app.cli.commands: register_review_commands(app)
    # Simulate a record predating instrumentation through a Core insert.
    db.session.execute(RoleRequest.__table__.insert().values(user_id=user1.id, requested_role='coord', status='approved', message='Old record'))
    db.session.commit()
    runner = app.test_cli_runner()
    assert runner.invoke(args=['application-data-backfill']).exit_code == 0
    assert ReviewSubmission.query.one().origin == 'legacy'
    assert ReviewDecision.query.one().actor_type == 'legacy_unknown'
    monkeypatch.setitem(app.config, 'APPLICATION_DATA_EXPORT_KEY', KEY)
    target = tmp_path / 'records.jsonl'
    result = runner.invoke(args=['export-application-data', '--output', str(target)])
    assert result.exit_code == 0, result.output
    record = json.loads(target.read_text(encoding='utf-8').strip())
    assert not record['trainingEligible'] and 'non_live_input' in record['exclusionReasons']
    assert target.with_name(target.name + '.manifest.json').exists()
    assert runner.invoke(args=['export-application-data', '--output', str(target)]).exit_code != 0
    csv_target = tmp_path / 'records.csv'
    assert runner.invoke(args=['export-application-data', '--format', 'csv', '--output', str(csv_target)]).exit_code == 0
    assert 'label.outcome' in csv_target.read_text(encoding='utf-8').splitlines()[0]


def test_organization_approval_keeps_dependent_role_decision_separate(client, user1, admin_headers):
    from models import City
    db.session.add(City(id='ast', name_ru='Astana')); db.session.commit()
    rid = submit_role(client, user1)
    payload = {'legalName': 'Volunteer Foundation', 'legalForm': 'Foundation', 'bin': '123456789012',
        'legalAddress': 'Office address', 'representativeName': 'Representative Name', 'authority': 'Director under charter',
        'email': 'private@example.test', 'phone': '+77771234567', 'aboutRu': 'Volunteer support', 'publicContact': '@volunteers',
        'cityId': 'ast', 'cat': None, 'dataConsent': True, 'authorityConfirmed': True, 'applicationDetails': details('organization')}
    response = client.post('/api/orgs', headers=headers(user1), json=payload)
    assert response.status_code == 201, response.get_json()
    aid = response.get_json()['application']['id']
    result = client.post(f'/api/admin/org-applications/{aid}/decision', headers=admin_headers,
        json={'decision': 'approved', 'registryChecked': True, 'authorityChecked': True,
              'note': 'Verified registry and representative authority', 'review': annotation('organization')})
    assert result.status_code == 200, result.get_json()
    role_submission = ReviewSubmission.query.filter_by(kind='organizer_role', source_id=rid).one()
    role_decision = ReviewDecision.query.filter_by(submission_id=role_submission.id).one()
    assert role_decision.actor_type == 'system' and 'non_human_decision' in quality_issues(role_submission, role_decision)
    examples = list(export_rows(KEY, training_only=True))
    assert len(examples) == 1 and examples[0]['kind'] == 'organization'
    assert '123456789012' not in json.dumps(examples) and 'private@example.test' not in json.dumps(examples)


def test_volunteer_application_and_aggregated_reports_keep_human_labels(client, user1, user2, admin_headers):
    event = Gathering(owner_id=user1.id, code='DATASET', title_ru='Cleanup', status='open')
    db.session.add(event); db.session.commit()
    response = client.post(f'/api/events/{event.id}/applications', headers=headers(user2),
        json={'message': 'Can help', 'skills': ['photo'], 'applicationDetails': details('event_participation')})
    assert response.status_code == 201
    aid = response.get_json()['application']['id']
    response = client.post(f'/api/applications/{aid}/accept', headers=headers(user1), json={'review': annotation('event_participation')})
    assert response.status_code == 200
    assert client.get(f'/api/admin/application-data/event_participation/{aid}/history', headers=headers(user1)).status_code == 200
    assert client.get(f'/api/admin/application-data/event_participation/{aid}/history', headers=headers(user2)).status_code == 403
    for user, reason in [(user1, 'First evidence'), (user2, 'Second complaint evidence')]:
        response = client.post('/api/reports', headers=headers(user), json={'targetType': 'event', 'targetId': event.id,
            'reason': reason, 'applicationDetails': {'formVersion': 1, 'answers': {'evidence': reason}}})
        assert response.status_code in (200, 201)
    report_id = response.get_json()['report']['id']
    report_submissions = ReviewSubmission.query.filter_by(kind='report', source_id=report_id).order_by(ReviewSubmission.revision).all()
    assert [r.snapshot['reason'] for r in report_submissions] == ['First evidence', 'Second complaint evidence']
    response = client.post(f'/api/admin/reports/{report_id}/resolve', headers=admin_headers,
        json={'review': annotation('report', reportOutcome='upheld', reasonCode='safety_concern')})
    assert response.status_code == 200
    assert ReviewSubmission.query.filter_by(kind='report').count() == 2
    samples = list(export_rows(KEY, training_only=True))
    assert {(s['kind'], s['label']['outcome']) for s in samples} == {('event_participation', 'approved'), ('report', 'upheld')}


def test_deleted_legacy_org_retains_evidence(client, user1, admin_headers):
    from models import Org
    org = Org(owner_id=user1.id, name='Old organization', verified=False)
    db.session.add(org); db.session.commit(); oid = org.id
    result = client.post(f'/api/admin/orgs/{oid}/reject', headers=admin_headers,
                         json={'review': annotation('legacy_organization', reasonCode='verification_failed')})
    assert result.status_code == 200
    assert db.session.get(Org, oid) is None
    submission = ReviewSubmission.query.filter_by(kind='legacy_organization', source_id=oid).one()
    assert submission.snapshot['name'] == 'Old organization'
    assert ReviewDecision.query.filter_by(submission_id=submission.id).one().outcome == 'rejected'
    assert list(export_rows(KEY, training_only=True)) == []


def test_conflicting_decisions_are_not_silently_training_truth(client, user1, admin_headers):
    user1.role = 'coord'; db.session.commit()
    result = client.post('/api/gatherings', headers=headers(user1), json={
        'what': 'Volunteer help', 'where': 'Campus', 'applicationDetails': details('gathering')})
    eid = result.get_json()['id']
    assert client.post(f'/api/admin/events/{eid}/approve', headers=admin_headers, json={'review': annotation('gathering')}).status_code == 200
    assert client.post(f'/api/admin/events/{eid}/reject', headers=admin_headers, json={'review': annotation('gathering', reasonCode='safety_concern')}).status_code == 200
    row = list(export_rows(KEY))[0]
    assert 'conflicting_decisions' in row['exclusionReasons']
    assert not list(export_rows(KEY, training_only=True))
