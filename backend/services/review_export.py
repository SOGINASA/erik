"""Allowlisted, deterministic dataset export; private documents are never exported."""
import hashlib
import hmac
from collections import Counter
from datetime import datetime, timezone
from models import ReviewSubmission, ReviewDecision
from services.review_schema import CHECKS, INTAKE_FIELDS, KINDS, REASON_CODES


def utc_iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z') if value.tzinfo is None else value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def schema_manifest():
    return {'schemaVersion': 1, 'formVersion': 1, 'taxonomyVersion': 1,
            'kinds': list(KINDS), 'reasonCodes': list(REASON_CODES), 'checks': CHECKS, 'intakeFields': INTAKE_FIELDS,
            'outcomes': ['approved', 'rejected', 'upheld', 'dismissed', 'resolved_unclassified'],
            'textPolicy': 'Free text is omitted by default. Explicit text export needs separate manual de-identification.',
            'splitPolicy': 'Keep both applicantGroup and caseGroup together across train/validation/test; use chronological evaluation.',
            'targetPolicy': 'Use label.* as targets only; never feed decisions, checks, reasons or review times into the model.'}


def quality_issues(submission, decision):
    issues = []
    if submission.origin != 'live': issues.append('non_live_input')
    if not all(submission.details.get('answers', {}).get(key) for key in INTAKE_FIELDS[submission.kind]):
        issues.append('incomplete_intake')
    if decision is None: return issues + ['unreviewed']
    if getattr(decision, '_conflicting_outcomes', False): issues.append('conflicting_decisions')
    if decision.actor_type != 'human': issues.append('non_human_decision')
    if decision.reviewed_revision != submission.revision: issues.append('unbound_review')
    if decision.outcome not in ('approved', 'rejected', 'upheld', 'dismissed'): issues.append('unclassified_outcome')
    if decision.reason_code not in REASON_CODES: issues.append('missing_reason_code')
    if decision.certainty != 'certain': issues.append('uncertain_decision')
    if any(decision.checks.get(key) not in ('passed', 'failed', 'not_applicable') for key in CHECKS[submission.kind]):
        issues.append('incomplete_checks')
    if decision.outcome == 'approved' and ('failed' in decision.checks.values() or decision.reason_code not in ('complete_and_valid', 'other')):
        issues.append('inconsistent_approval')
    if decision.outcome == 'rejected' and decision.reason_code == 'complete_and_valid': issues.append('inconsistent_rejection')
    return issues


def rows_with_labels(kind=None):
    query = ReviewSubmission.query
    if kind: query = query.filter_by(kind=kind)
    # Two ordered queries avoid per-row reviewer/source lookups or current profile data.
    decisions, outcomes = {}, {}
    for decision in ReviewDecision.query.order_by(ReviewDecision.id):
        decisions[decision.submission_id] = decision
        outcomes.setdefault(decision.submission_id, set()).add(decision.outcome)
    for key, decision in decisions.items():
        decision._conflicting_outcomes = len(outcomes[key]) > 1
    for row in query.order_by(ReviewSubmission.kind, ReviewSubmission.source_id, ReviewSubmission.revision):
        yield row, decisions.get(row.id)


def dataset_stats():
    counts, kinds, outcomes, exclusions = Counter(), Counter(), Counter(), Counter()
    for submission, decision in rows_with_labels():
        counts['submissions'] += 1; kinds[submission.kind] += 1
        problems = quality_issues(submission, decision)
        counts['trainingEligible' if not problems else 'excluded'] += 1
        if decision: outcomes[decision.outcome] += 1
        exclusions.update(problems)
    return {**dict(counts), 'kinds': dict(kinds), 'outcomes': dict(outcomes), 'exclusionReasons': dict(exclusions),
            'schemaVersion': 1, 'decisions': ReviewDecision.query.count()}


def export_rows(secret, *, kind=None, training_only=False, include_text=False):
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError('Set APPLICATION_DATA_EXPORT_KEY to a stable random secret of at least 32 characters')
    def pseudonym(namespace, value):
        return hmac.new(secret.encode(), f'{namespace}:{value}'.encode(), hashlib.sha256).hexdigest()[:32] if value is not None else None
    def features(value, prefix='input'):
        result = {}
        if isinstance(value, dict):
            for key in sorted(value): result.update(features(value[key], f'{prefix}.{key}'))
        elif isinstance(value, list):
            result[prefix + '.count'] = len(value)
            # No arbitrary free-text tokens or document bytes in numeric exports.
            for index, item in enumerate(value): result.update(features(item, f'{prefix}.{index}'))
        elif isinstance(value, str):
            result[prefix + '.length'] = len(value)
            result[prefix + '.present'] = bool(value.strip())
        elif isinstance(value, (bool, int, float)) or value is None:
            result[prefix] = value
        return result
    categories = ('theme', 'city_id', 'format', 'requested_role', 'target_type', 'verification_method', 'document_mime', 'cat', 'cityId')
    for submission, decision in rows_with_labels(kind):
        issues = quality_issues(submission, decision)
        if training_only and issues: continue
        snapshot = submission.snapshot
        safe_features = features(snapshot)
        safe_features.update(features(submission.applicant_context, 'applicant'))
        safe_features['category.applicant_role'] = submission.applicant_context.get('role')
        safe_features.update(features(submission.details.get('answers', {}), 'answers'))
        for field in categories:
            if field in snapshot: safe_features[f'category.{field}'] = snapshot[field]
        # Exact source/user/university/target IDs are grouping keys, not features.
        for field in ('university_id', 'target_id'):
            safe_features.pop(f'input.{field}', None)
        row = {'schemaVersion': 1, 'formVersion': submission.form_version,
               'submissionKey': pseudonym('submission', submission.id), 'kind': submission.kind,
               'caseGroup': pseudonym('case', f'{submission.kind}:{submission.source_id}'),
               'applicantGroup': pseudonym('applicant', submission.applicant_id), 'revision': submission.revision,
               'submittedAt': utc_iso(submission.submitted_at), 'origin': submission.origin,
               'features': safe_features, 'trainingEligible': not issues, 'exclusionReasons': issues,
               'label': {'outcome': decision.outcome, 'reasonCode': decision.reason_code,
                         'certainty': decision.certainty, 'checks': decision.checks,
                         'reviewedRevision': decision.reviewed_revision,
                         'actorType': decision.actor_type, 'reviewerGroup': pseudonym('reviewer', decision.reviewer_id),
                         'decidedAt': utc_iso(decision.decided_at), 'taxonomyVersion': decision.taxonomy_version} if decision else None}
        if include_text:
            row['privateTextForDeidentification'] = {'snapshot': snapshot, 'answers': submission.details.get('answers', {}),
                                                    'reviewNote': decision.note if decision else None}
        yield row
