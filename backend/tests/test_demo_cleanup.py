import pytest
from models import db, User, Gathering, Org, Participant, Report
from seed import seed_demo
from services.demo_cleanup import purge_demo_data


def test_cleanup_preserves_real_accounts_admin_and_catalogs(client):
    from models import Theme, City
    seed_demo()
    admin = User.query.filter_by(email='admin@erik.kz').one()
    admin_id = admin.id
    real = User(email='real@example.test', full_name='Real', is_active=True)
    real.set_password('real-password-123')
    db.session.add(real)
    db.session.commit()
    real_id = real.id
    before = User.query.count()
    preview = purge_demo_data()
    assert preview['delete']['users'] > 80
    assert User.query.count() == before
    with pytest.raises(ValueError, match='password'):
        purge_demo_data(apply=True)
    assert User.query.count() == before
    result = purge_demo_data(apply=True, admin_password='new-secret-admin-password')
    db.session.expire_all()
    assert result['applied']
    assert {u.id for u in User.query.all()} == {admin_id, real_id}
    assert db.session.get(User, admin_id).check_password('new-secret-admin-password')
    assert db.session.get(User, real_id).check_password('real-password-123')
    assert not Gathering.query.count()
    assert not Org.query.count()
    assert not Participant.query.count()
    assert not Report.query.count()
    assert Theme.query.count() and City.query.count()
    assert purge_demo_data()['delete'] == {}


def test_cleanup_requires_a_surviving_admin(client):
    db.session.add(User(device_id='demo-admin', user_type='admin'))
    db.session.commit()
    with pytest.raises(ValueError, match='administrator'):
        purge_demo_data(apply=True)
    assert User.query.count() == 1
