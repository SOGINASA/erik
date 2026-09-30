"""Published legal documents and explicit registration consent.

The server snapshots the exact published text and operator declarations. No IP,
user-agent, password, or authentication token is included in consent evidence.
"""
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re

from flask import current_app, jsonify

from models import db, LegalConsent

LEGAL_VERSION = '2026-09-28.1'
LEGAL_DOCUMENT_PATH = Path(__file__).resolve().parents[1] / 'legal' / f'{LEGAL_VERSION}.json'
ACCEPTANCE_FIELDS = ('termsAccepted', 'privacyAccepted', 'consentAccepted', 'adultConfirmed')


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def legal_manifest():
    """One immutable document file per publication; configuration is public metadata."""
    with LEGAL_DOCUMENT_PATH.open(encoding='utf-8') as handle:
        manifest = json.load(handle)
    if manifest['version'] != LEGAL_VERSION:
        raise ValueError('Legal document version does not match publication')

    def config(name):
        return str(current_app.config.get(name) or '').strip()

    operator = {
        'name': config('LEGAL_OPERATOR_NAME'),
        'bin': config('LEGAL_OPERATOR_BIN'),
        'address': config('LEGAL_OPERATOR_ADDRESS'),
        'email': config('LEGAL_PRIVACY_EMAIL'),
    }
    declarations = {
        'operator': operator,
        'storageCountry': config('LEGAL_STORAGE_COUNTRY').upper(),
        'processors': config('LEGAL_PROCESSORS'),
    }
    # Fingerprint the complete publication and operator declarations: even an
    # accidental text edit without a new base version invalidates an open form.
    publication = {'manifest': manifest, 'declarations': declarations}
    fingerprint = sha256(_canonical(publication).encode('utf-8')).hexdigest()[:12]
    missing = [name for name in (
        'LEGAL_OPERATOR_NAME', 'LEGAL_OPERATOR_BIN', 'LEGAL_OPERATOR_ADDRESS', 'LEGAL_PRIVACY_EMAIL',
        'LEGAL_STORAGE_COUNTRY', 'LEGAL_PROCESSORS',
    ) if not config(name)]
    if operator['bin'] and not re.fullmatch(r'[0-9]{12}', operator['bin']):
        missing.append('LEGAL_OPERATOR_BIN_VALID')
    if declarations['storageCountry'] and declarations['storageCountry'] != 'KZ':
        missing.append('LEGAL_STORAGE_COUNTRY=KZ')
    if operator['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', operator['email']):
        missing.append('LEGAL_PRIVACY_EMAIL_VALID')
    return {
        **deepcopy(manifest),
        **declarations,
        'documentVersion': manifest['version'],
        'version': f"{manifest['version']}-{fingerprint}",
        'registrationAvailable': not missing or not current_app.config.get('REQUIRE_LEGAL_CONFIGURATION', False),
        'missingConfiguration': missing,
    }


def validate_legal_acceptance(data):
    """Validate before ANY mutation. Returns (snapshot, Flask error response)."""
    manifest = legal_manifest()
    if not manifest['registrationAvailable']:
        return None, (jsonify({
            'error': 'Регистрация временно недоступна: оператор ещё не заполнил обязательные сведения.',
            'code': 'legal_configuration_required',
            'missingConfiguration': manifest['missingConfiguration'],
        }), 503)
    legal = data.get('legal') if isinstance(data, dict) else None
    if not isinstance(legal, dict) or any(legal.get(key) is not True for key in ACCEPTANCE_FIELDS):
        return None, (jsonify({
            'error': 'Подтвердите условия использования, ознакомление с политикой, согласие на обработку данных и возраст от 18 лет.',
            'code': 'legal_consent_required',
        }), 400)
    if legal.get('version') != manifest['version']:
        return None, (jsonify({
            'error': 'Документы обновились. Откройте актуальную редакцию и подтвердите её заново.',
            'code': 'legal_version_mismatch',
            'version': manifest['version'],
        }), 409)
    return manifest, None


def record_legal_consent(user, snapshot, source):
    """Append consent evidence inside the caller's transaction; never commit here."""
    db.session.flush()
    document_snapshot = deepcopy(snapshot)
    receipt = LegalConsent(
        user_id=user.id,
        subject_name=(user.full_name or '').strip(),
        accepted_at=datetime.now(timezone.utc),
        version=snapshot['version'],
        source=source,
        terms_accepted=True,
        privacy_accepted=True,
        consent_accepted=True,
        adult_confirmed=True,
        document_snapshot=document_snapshot,
        document_sha256=sha256(_canonical(document_snapshot).encode('utf-8')).hexdigest(),
    )
    db.session.add(receipt)
    db.session.flush()
    return receipt


def validate_subject_name(name):
    """Collect the subject's stated surname/name, without claiming identity checks."""
    if not isinstance(name, str) or len(name.strip()) > 100 or len(name.split()) < 2:
        return jsonify({
            'error': 'Укажите фамилию и имя (отчество — при наличии), не более 100 символов.',
            'code': 'legal_subject_name_required',
        }), 400
    return None
