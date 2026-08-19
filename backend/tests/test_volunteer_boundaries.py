"""Границы роли «волонтёр».

Две стороны одной продуктовой границы: волонтёр не ПРОВОДИТ сборы (создание — привилегия
coord|org), но зато видит, с кем он на сбор идёт (список со-участников с ссылками на
профили). Первое раньше не проверялось вовсе — роут молча повышал vol → coord, и роль,
выбранная в онбординге, ничего не значила.
"""
import pytest
from flask_jwt_extended import create_access_token

from models import db, Gathering, GatheringCoordinator, GatheringRole, Participant


def _headers(user):
    return {'Authorization': f'Bearer {create_access_token(identity=str(user.id))}',
            'Content-Type': 'application/json'}


NEW_GATHERING = {'what': 'Субботник', 'where': 'Парк', 'date': '2026-08-01', 'time': '10:00'}


# ── создание сбора: только организатор ──

def test_volunteer_cannot_create_gathering(client, user1):
    """Роль по умолчанию — 'vol'. Ей создание запрещено."""
    assert user1.role in (None, 'vol')
    r = client.post('/api/gatherings', headers=_headers(user1), json=NEW_GATHERING)
    assert r.status_code == 403
    assert r.get_json()['errorKz']                     # экран двуязычный
    assert Gathering.query.count() == 0


def test_refused_create_does_not_touch_the_user(client, user1):
    """Отказ проверяется ДО правок: ни имени, ни повышения роли он оставить не должен.

    Раньше здесь было ровно наоборот — роут повышал vol → coord, то есть сам факт
    попытки делал волонтёра организатором.
    """
    user1.full_name = None
    db.session.commit()
    client.post('/api/gatherings', headers=_headers(user1),
                json={**NEW_GATHERING, 'name': 'Новое Имя'})
    db.session.refresh(user1)
    assert user1.role == 'vol'
    assert not user1.full_name


@pytest.mark.parametrize('role', ['coord', 'org'])
def test_organizer_can_create_gathering(client, user1, role):
    user1.role = role
    db.session.commit()
    r = client.post('/api/gatherings', headers=_headers(user1), json=NEW_GATHERING)
    assert r.status_code == 201
    assert r.get_json()['role'] == role                # роль не подменяется ответом


# ── список со-участников ──

@pytest.fixture
def gathering(user2):
    """Открытый сбор, который ведёт user2 (чтобы user1 был в нём обычным волонтёром)."""
    g = Gathering(code='TEAM01', owner_id=user2.id, title_ru='Уборка', title_kz='Тазалау',
                  place_ru='Парк', place_kz='Саябақ', status='open', needed=20)
    db.session.add(g)
    db.session.flush()
    db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=user2.id, role='owner'))
    db.session.commit()
    return g


def _join(gathering, user=None, name=None, answer='yes', role_id=None):
    p = Participant(gathering_id=gathering.id, user_id=user.id if user else None,
                    name=name or (user.full_name if user else 'Гость'),
                    phone='+7 700 000 00 00', answer=answer, role_id=role_id,
                    is_guest=user is None)
    db.session.add(p)
    db.session.commit()
    return p


def test_co_participants_visible_to_a_registered_volunteer(client, gathering, user1, user2):
    role = GatheringRole(gathering_id=gathering.id, title_ru='Фотограф', title_kz='Фотограф',
                         capacity=2)
    db.session.add(role)
    db.session.commit()
    _join(gathering, user1, role_id=role.id)
    _join(gathering, user2, answer='maybe')

    r = client.get(f'/api/events/{gathering.id}/co-participants', headers=_headers(user1))
    assert r.status_code == 200
    rows = r.get_json()['participants']
    assert [x['name'] for x in rows] == ['User One', 'User Two']   # 'yes' раньше 'maybe'
    me, other = rows
    assert me['userId'] == user1.id and me['isMe'] is True
    assert me['roleTitleRu'] == 'Фотограф' and me['roleTitleKz'] == 'Фотограф'
    assert other['isMe'] is False and other['answer'] == 'maybe'
    # PII координатора наружу не уходит
    assert all('phone' not in x for x in rows)


def test_nameless_device_user_sees_the_list(client, gathering, user1, user2):
    """Регрессия: эндпоинт стоял под @profiled_required и требовал заполненное имя.

    Записаться на сбор можно device-сессией БЕЗ имени (PUT /events/<id>/registration —
    голый @jwt_required(), весь продукт про RSVP в один тап). Получалось, что человек
    уже в ростере, а список тех, с кем он идёт, отвечал ему 403 «Заполните имя».
    Пускать сюда должно ЧЛЕНСТВО, а не наличие имени.
    """
    user1.full_name = None
    db.session.commit()
    _join(gathering, user1, name='Гость')
    _join(gathering, user2)

    r = client.get(f'/api/events/{gathering.id}/co-participants', headers=_headers(user1))
    assert r.status_code == 200
    assert {x['name'] for x in r.get_json()['participants']} == {'Гость', 'User Two'}


def test_co_participants_hidden_from_outsiders(client, gathering, user1):
    """Кто с кем ходит — не публичная информация: без записи на сбор списка нет."""
    r = client.get(f'/api/events/{gathering.id}/co-participants', headers=_headers(user1))
    assert r.status_code == 403


def test_answer_no_loses_access_and_place_in_the_list(client, gathering, user1, user2):
    """'no' — это выход: ни в списке, ни в праве его смотреть такого человека нет."""
    _join(gathering, user2)
    _join(gathering, user1, answer='no')
    assert client.get(f'/api/events/{gathering.id}/co-participants',
                      headers=_headers(user1)).status_code == 403

    r = client.get(f'/api/events/{gathering.id}/co-participants', headers=_headers(user2))
    assert [x['name'] for x in r.get_json()['participants']] == ['User Two']


def test_walk_in_guest_has_no_profile_link(client, gathering, user1):
    """Гость без аккаунта в списке есть (он реально придёт), но userId у него нет."""
    _join(gathering, user1)
    _join(gathering, name='Прохожий')
    r = client.get(f'/api/events/{gathering.id}/co-participants', headers=_headers(user1))
    guest = next(x for x in r.get_json()['participants'] if x['name'] == 'Прохожий')
    assert guest['userId'] is None


def test_owner_sees_the_list_without_registering(client, gathering, user1, user2):
    _join(gathering, user1)
    assert client.get(f'/api/events/{gathering.id}/co-participants',
                      headers=_headers(user2)).status_code == 200


def test_hidden_gathering_is_not_found(client, gathering, user1):
    """Видимость списка = видимость самого события (_visible_gathering)."""
    _join(gathering, user1)
    gathering.status = 'deleted'
    db.session.commit()
    assert client.get(f'/api/events/{gathering.id}/co-participants',
                      headers=_headers(user1)).status_code == 404
