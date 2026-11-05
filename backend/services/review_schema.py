"""Version 1 of the intake and human annotation contract (no ML inference)."""
KINDS = ('gathering', 'organizer_role', 'organization', 'university_membership', 'event_participation', 'report', 'legacy_organization')
REASON_CODES = ('complete_and_valid', 'missing_details', 'eligibility_not_met', 'verification_failed',
                'duplicate', 'safety_concern', 'out_of_scope', 'other')
CHECKS = {
    'gathering': ('completeness', 'safety', 'scope'),
    'organizer_role': ('motivation', 'experience', 'scope'),
    'organization': ('registration', 'authority', 'scope'),
    'university_membership': ('document_readable', 'university_matches'),
    'event_participation': ('requirements_match',),
    'report': ('evidence_reviewed',),
    'legacy_organization': ('registration', 'authority'),
}
INTAKE_FIELDS = {
    'gathering': ('purpose', 'volunteerTasks', 'safetyPlan'),
    'organizer_role': ('motivation', 'experience', 'plannedContribution'),
    'organization': ('volunteerTasks', 'supportPlan'),
    'university_membership': ('faculty', 'studyYear', 'motivation'),
    'event_participation': ('motivation', 'experience', 'availability'),
    'report': ('evidence',),
    'legacy_organization': (),
}


def validate_details(value, kind=None):
    if not isinstance(value, dict) or value.get('formVersion') != 1:
        raise ValueError('Укажите applicationDetails с formVersion=1')
    fields = value.get('answers')
    allowed = set(INTAKE_FIELDS[kind]) if kind else {key for values in INTAKE_FIELDS.values() for key in values}
    if not isinstance(fields, dict) or set(fields) - allowed:
        raise ValueError('Неизвестные поля анкеты')
    clean = {}
    for key, answer in fields.items():
        if not isinstance(answer, str) or not 1 <= len(answer.strip()) <= 2000:
            raise ValueError('Ответы анкеты должны содержать от 1 до 2000 символов')
        clean[key] = answer.strip()
    return {'formVersion': 1, 'answers': clean}


def validate_review(value):
    if not isinstance(value, dict) or set(value) - {'reasonCode', 'certainty', 'checks', 'note', 'reportOutcome', 'submissionRevision'}:
        raise ValueError('Некорректная разметка решения')
    if value.get('reasonCode') not in REASON_CODES or value.get('certainty') not in ('certain', 'needs_second_review'):
        raise ValueError('Выберите код причины и уверенность в решении')
    checks = value.get('checks', {})
    if not isinstance(checks, dict) or set(checks) - {key for values in CHECKS.values() for key in values}:
        raise ValueError('Неизвестные пункты проверки')
    if any(v not in ('passed', 'failed', 'not_applicable', 'not_checked') for v in checks.values()):
        raise ValueError('Некорректные результаты проверки')
    note = value.get('note', '')
    if not isinstance(note, str) or len(note) > 2000:
        raise ValueError('Комментарий проверяющего должен быть до 2000 символов')
    if value.get('reportOutcome') not in (None, 'upheld', 'dismissed'):
        raise ValueError('Выберите исход рассмотрения жалобы')
    if value.get('submissionRevision') is not None and (type(value['submissionRevision']) is not int or value['submissionRevision'] < 1):
        raise ValueError('Некорректная версия рассматриваемой заявки')
    return {**value, 'checks': checks, 'note': note.strip()}
