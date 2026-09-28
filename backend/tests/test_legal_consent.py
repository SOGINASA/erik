"""Consent is a server-side, atomic requirement, not a cosmetic checkbox."""
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json

from flask_jwt_extended import create_access_token
import pytest

from models import db, City, Gathering, LegalConsent, Participant, Theme, User
from services.legal import legal_manifest


def _registration(legal=None, **extra):
    data = {'nickname': 'new_person', 'password': 'secret123', 'full_name': 'Иван Тестовый'}
    if legal is not None:
        data['legal'] = legal
    data.update(extra)
    return data


def _headers(user):
    return {'Authorization': 'Bearer ' + create_access_token(identity=str(user.id))}


def _anonymous(device='unregistered-device', role='vol'):
    user = User(device_id=device, role=role, is_active=True)
    db.session.add(user)
    db.session.commit()
    return user


def test_legal_documents_public_and_available(client):
    response = client.get('/api/legal')
    assert response.status_code == 200
    body = response.get_json()
    assert body['registrationAvailable'] is True
    assert body['version'].startswith(body['documentVersion'] + '-')
    assert body['missingConfiguration'] == []
    assert set(body['documents']) == {'terms', 'privacy', 'consent'}
    assert body['operator']['email'] == 'privacy@example.test'
    assert response.headers['Cache-Control'] == 'no-store'
    assert User.query.count() == 0


@pytest.mark.parametrize('legal', [None, {}, True, [], 'true'])
def test_missing_or_malformed_consent_never_creates_user(client, legal):
    response = client.post('/api/auth/register', json=_registration(legal))
    assert response.status_code == 400
    assert response.get_json()['code'] == 'legal_consent_required'
    assert User.query.count() == 0
    assert LegalConsent.query.count() == 0


@pytest.mark.parametrize('field', ['termsAccepted', 'privacyAccepted', 'consentAccepted', 'adultConfirmed'])
@pytest.mark.parametrize('value', [False, 'true', 'false', 1, 0, None])
def test_all_choices_require_actual_json_true(client, legal_acceptance, field, value):
    legal_acceptance[field] = value
    response = client.post('/api/auth/register', json=_registration(legal_acceptance))
    assert response.status_code == 400
    assert User.query.count() == 0
    assert LegalConsent.query.count() == 0


def test_stale_version_requires_fresh_acceptance(client, legal_acceptance):
    legal_acceptance['version'] = 'old-version'
    response = client.post('/api/auth/register', json=_registration(legal_acceptance))
    assert response.status_code == 409
    assert response.get_json()['code'] == 'legal_version_mismatch'
    assert response.get_json()['version'] == legal_manifest()['version']
    assert User.query.count() == 0
    assert LegalConsent.query.count() == 0


def test_operator_change_invalidates_form(client, app, monkeypatch, legal_acceptance):
    monkeypatch.setitem(app.config, 'LEGAL_OPERATOR_NAME', 'Другой оператор')
    response = client.post('/api/auth/register', json=_registration(legal_acceptance))
    assert response.status_code == 409
    assert response.get_json()['version'] != legal_acceptance['version']
    assert User.query.count() == 0


@pytest.mark.parametrize('setting', [
    'LEGAL_OPERATOR_NAME', 'LEGAL_OPERATOR_BIN', 'LEGAL_OPERATOR_ADDRESS', 'LEGAL_PRIVACY_EMAIL',
    'LEGAL_STORAGE_COUNTRY', 'LEGAL_PROCESSORS',
])
def test_missing_operator_config_closes_new_registration(client, app, monkeypatch, legal_acceptance, setting):
    monkeypatch.setitem(app.config, setting, '')
    manifest = client.get('/api/legal').get_json()
    assert manifest['registrationAvailable'] is False
    assert setting in manifest['missingConfiguration']
    response = client.post('/api/auth/register', json=_registration(legal_acceptance))
    assert response.status_code == 503
    assert response.get_json()['code'] == 'legal_configuration_required'
    assert User.query.count() == 0


def test_storage_outside_kazakhstan_does_not_enable_registration(client, app, monkeypatch):
    monkeypatch.setitem(app.config, 'LEGAL_STORAGE_COUNTRY', 'US')
    manifest = client.get('/api/legal').get_json()
    assert manifest['registrationAvailable'] is False
    assert 'LEGAL_STORAGE_COUNTRY=KZ' in manifest['missingConfiguration']


@pytest.mark.parametrize('name', ['', 'nickname', 'a' * 101])
def test_consent_requires_subject_stated_name(client, legal_acceptance, name):
    response = client.post('/api/auth/register', json=_registration(legal_acceptance, full_name=name))
    assert response.status_code == 400
    assert response.get_json()['code'] == 'legal_subject_name_required'
    assert User.query.count() == 0


def test_registration_persists_exact_server_evidence_and_profile_atomically(client, legal_acceptance):
    db.session.add(City(id='ast', name_ru='Астана'))
    db.session.add(Theme(id='eco', label_ru='Экология'))
    db.session.commit()
    before = datetime.now(timezone.utc)
    response = client.post('/api/auth/register', json=_registration(
        legal_acceptance, phone='+7 700 000 00 00', cityId='ast', role='coord',
        interests=['eco', 'nonexistent', 'eco'], acceptedAt='1900-01-01',
    ))
    assert response.status_code == 201
    body = response.get_json()
    receipt = LegalConsent.query.one()
    user = User.query.one()
    assert receipt.user_id == user.id == body['user']['id']
    assert receipt.version == legal_acceptance['version']
    assert receipt.subject_name == 'Иван Тестовый'
    assert receipt.accepted_at.replace(tzinfo=timezone.utc) >= before
    assert receipt.source == 'auth.register'
    assert receipt.terms_accepted and receipt.privacy_accepted and receipt.consent_accepted and receipt.adult_confirmed
    assert receipt.document_snapshot == legal_manifest()
    assert receipt.document_sha256 == sha256(json.dumps(
        receipt.document_snapshot, ensure_ascii=False, sort_keys=True, separators=(',', ':')
    ).encode()).hexdigest()
    assert body['legalConsent']['id'] == receipt.id
    assert body['legalConsent']['documentSha256'] == receipt.document_sha256
    assert user.city_id == 'ast' and user.phone == '+7 700 000 00 00' and user.role == 'coord'
    assert user.interests == ['eco']
    assert 'secret123' not in json.dumps(receipt.document_snapshot)
    assert user.check_password('secret123')


def test_user_and_consent_rollback_together_if_receipt_fails(client, legal_acceptance, monkeypatch):
    def fail_receipt(*_args):
        db.session.flush()  # user insert happened, but must still be rolled back
        raise RuntimeError('simulated evidence storage failure')
    monkeypatch.setattr('routes.auth.record_legal_consent', fail_receipt)
    response = client.post('/api/auth/register', json=_registration(legal_acceptance))
    assert response.status_code == 500
    assert User.query.count() == LegalConsent.query.count() == 0


def test_existing_device_upgrade_without_consent_does_not_mutate(client):
    user = _anonymous()
    response = client.post('/api/auth/register', json=_registration(),
                           headers={'X-Device-Id': user.device_id})
    assert response.status_code == 400
    db.session.refresh(user)
    assert user.password_hash is None and user.nickname is None and user.full_name is None
    assert LegalConsent.query.count() == 0


def test_device_upgrade_keeps_identity_and_appends_receipt(client, legal_acceptance):
    user = _anonymous()
    uid = user.id
    response = client.post('/api/auth/register', json=_registration(legal_acceptance),
                           headers={'X-Device-Id': user.device_id})
    assert response.status_code == 201
    assert User.query.one().id == uid
    assert LegalConsent.query.one().user_id == uid


def test_named_device_requires_consent_and_rolls_back_invalid_request(client):
    response = client.post('/api/session', json={'deviceId': 'new-device', 'name': 'Иван Тестовый'})
    assert response.status_code == 400
    assert response.get_json()['code'] == 'legal_consent_required'
    assert User.query.count() == 0


def test_anonymous_device_can_browse_without_manufactured_consent(client):
    response = client.post('/api/session', json={'deviceId': 'new-device'})
    assert response.status_code == 201
    assert User.query.one().full_name is None
    assert User.query.one().user_agent is None
    assert LegalConsent.query.count() == 0


def test_named_device_upgrade_records_once_and_resume_does_not_fabricate(client, legal_acceptance):
    user = _anonymous()
    response = client.post('/api/session', json={
        'deviceId': user.device_id, 'name': 'Иван Тестовый', 'legal': legal_acceptance,
    })
    assert response.status_code == 200
    assert LegalConsent.query.one().source == 'session.register'
    resume = client.post('/api/session', json={'deviceId': user.device_id})
    assert resume.status_code == 200
    assert 'legalConsent' not in resume.get_json()
    assert LegalConsent.query.count() == 1


def test_existing_named_device_can_resume_without_operator_configuration(client, app, monkeypatch):
    user = User(device_id='existing-device', full_name='Existing Person', is_active=True)
    db.session.add(user)
    db.session.commit()
    monkeypatch.setitem(app.config, 'LEGAL_OPERATOR_NAME', '')
    response = client.post('/api/session', json={'deviceId': user.device_id})
    assert response.status_code == 200
    assert LegalConsent.query.count() == 0


def test_device_creation_and_evidence_failure_roll_back_together(client, legal_acceptance, monkeypatch):
    def fail(*_args):
        raise RuntimeError('storage unavailable')
    monkeypatch.setattr('routes.session.record_legal_consent', fail)
    response = client.post('/api/session', json={
        'deviceId': 'new-device', 'name': 'Иван Тестовый', 'legal': legal_acceptance,
    })
    assert response.status_code == 500
    assert User.query.count() == LegalConsent.query.count() == 0


def test_auth_profile_cannot_bypass_consent(client):
    user = _anonymous()
    response = client.put('/api/auth/profile', json={'full_name': 'Иван Тестовый'}, headers=_headers(user))
    assert response.status_code == 400
    assert response.get_json()['code'] == 'legal_consent_required'
    db.session.refresh(user)
    assert user.full_name is None


def test_auth_profile_can_create_named_identity_with_evidence(client, legal_acceptance):
    user = _anonymous()
    response = client.put('/api/auth/profile', json={'full_name': 'Иван Тестовый', 'legal': legal_acceptance},
                          headers=_headers(user))
    assert response.status_code == 200
    assert LegalConsent.query.one().source == 'auth.profile'


def test_patch_me_cannot_bypass_profile_registration(client):
    user = _anonymous()
    response = client.patch('/api/me', json={'name': 'Иван Тестовый'}, headers=_headers(user))
    assert response.status_code == 403
    db.session.refresh(user)
    assert user.full_name is None


@pytest.mark.parametrize('name', [None, 'Иван Тестовый'])
def test_anonymous_rsvp_write_requires_consent(client, user1, name):
    guest = _anonymous()
    gathering = Gathering(code='LEGAL01', owner_id=user1.id, status='open')
    db.session.add(gathering)
    db.session.commit()
    response = client.put('/api/g/LEGAL01/rsvp', json={'answer': 'yes', 'name': name}, headers=_headers(guest))
    assert response.status_code == 400
    assert response.get_json()['code'] == 'legal_consent_required'
    assert Participant.query.count() == 0
    assert guest.full_name is None


def test_anonymous_organizer_cannot_create_profile_by_gathering(client):
    user = _anonymous(role='coord')
    response = client.post('/api/gatherings', json={'what': 'Уборка', 'name': 'Иван Тестовый'},
                           headers=_headers(user))
    assert response.status_code == 400
    assert response.get_json()['code'] == 'legal_consent_required'
    assert Gathering.query.count() == 0
    assert user.full_name is None


def test_consent_snapshot_survives_config_change_and_blocks_orm_rewrite(client, app, monkeypatch, legal_acceptance):
    client.post('/api/auth/register', json=_registration(legal_acceptance))
    receipt = LegalConsent.query.one()
    original = deepcopy(receipt.document_snapshot)
    monkeypatch.setitem(app.config, 'LEGAL_OPERATOR_NAME', 'Следующий оператор')
    assert legal_manifest()['operator']['name'] != receipt.document_snapshot['operator']['name']
    assert receipt.document_snapshot == original
    receipt.version = 'forged'
    with pytest.raises(ValueError, match='append-only'):
        db.session.commit()
    db.session.rollback()
    assert LegalConsent.query.one().version == legal_acceptance['version']


def test_document_text_change_invalidates_existing_form(client, legal_acceptance, monkeypatch, tmp_path):
    from services import legal as legal_service

    publication = json.loads(legal_service.LEGAL_DOCUMENT_PATH.read_text(encoding='utf-8'))
    publication['documents']['terms']['title'] = 'Изменённые условия'
    updated_file = tmp_path / 'changed-legal.json'
    updated_file.write_text(json.dumps(publication, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(legal_service, 'LEGAL_DOCUMENT_PATH', updated_file)

    current = client.get('/api/legal').get_json()
    assert current['documentVersion'] == publication['version']  # base revision was not bumped
    assert current['version'] != legal_acceptance['version']
    response = client.post('/api/auth/register', json=_registration(legal_acceptance))
    assert response.status_code == 409
    assert response.get_json()['code'] == 'legal_version_mismatch'
    assert User.query.count() == LegalConsent.query.count() == 0


@pytest.mark.parametrize('extra', [
    {'password': None}, {'password': []}, {'password': {}},
    {'role': []}, {'role': {}}, {'cityId': []}, {'cityId': {}},
    {'interests': 'eco'}, {'phone': ['+7']}, {'full_name': {'name': 'Иван'}},
])
def test_malformed_registration_fields_are_rejected_without_writes(client, legal_acceptance, extra):
    response = client.post('/api/auth/register', json=_registration(legal_acceptance, **extra))
    assert response.status_code == 400
    assert User.query.count() == LegalConsent.query.count() == 0


@pytest.mark.parametrize('payload', [['invalid'], True, 'invalid'])
def test_non_object_registration_body_is_rejected(client, payload):
    assert client.post('/api/auth/register', json=payload).status_code == 400
    assert client.post('/api/session', json=payload).status_code == 400
    assert User.query.count() == LegalConsent.query.count() == 0


def test_failed_profile_validation_leaves_no_pending_personal_data(client, user1, legal_acceptance):
    user = _anonymous()
    response = client.put('/api/auth/profile', json={
        'full_name': 'Иван Тестовый', 'nickname': user1.nickname, 'legal': legal_acceptance,
    }, headers=_headers(user))
    assert response.status_code == 400
    assert user.full_name is None
    assert user.nickname is None
    assert user not in db.session.dirty
    assert LegalConsent.query.count() == 0


@pytest.mark.parametrize('extra', [{'role': []}, {'role': {}}, {'name': ['Иван', 'Тестовый']}])
def test_malformed_named_device_registration_never_writes(client, legal_acceptance, extra):
    response = client.post('/api/session', json={
        'deviceId': 'invalid-device', 'name': 'Иван Тестовый', 'legal': legal_acceptance, **extra,
    })
    assert response.status_code == 400
    assert User.query.count() == LegalConsent.query.count() == 0
