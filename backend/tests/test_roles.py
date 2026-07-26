"""Роли волонтёров на сборе.

Проверяем ровно то, что ломается на практике: расхождение двух RSVP-роутов, границы
вместимости, чужие роли, освобождение места и то, что сбор БЕЗ ролей ведёт себя как раньше.
"""
import pytest
from flask_jwt_extended import create_access_token

from models import db, Gathering, GatheringCoordinator, GatheringRole, Participant


def _headers(user):
    return {'Authorization': f'Bearer {create_access_token(identity=str(user.id))}',
            'Content-Type': 'application/json'}


@pytest.fixture
def organizer(user1):
    """user1 как организатор. Создание сбора — привилегия роли coord|org
    (routes/gatherings.py:create_gathering), а фабрика юзеров даёт дефолтную 'vol'."""
    user1.role = 'coord'
    db.session.commit()
    return user1


@pytest.fixture
def gathering(user1):
    """Открытый сбор user1 (owner) — на нём и живут роли."""
    g = Gathering(code='ROLE01', owner_id=user1.id, title_ru='Уборка', title_kz='Тазалау',
                  place_ru='Парк', place_kz='Саябақ', status='open', needed=20)
    db.session.add(g)
    db.session.flush()
    db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=user1.id, role='owner'))
    db.session.commit()
    return g


@pytest.fixture
def roles(gathering):
    """Две роли: «Фотограф» на одно место и безлимитная «Общая помощь»."""
    photo = GatheringRole(gathering_id=gathering.id, title_ru='Фотограф', title_kz='Фотограф',
                          capacity=1, sort=0)
    helper = GatheringRole(gathering_id=gathering.id, title_ru='Общая помощь',
                           title_kz='Жалпы көмек', capacity=0, newbie=True, sort=1)
    db.session.add_all([photo, helper])
    db.session.commit()
    return photo, helper


# ── создание ──

def test_create_gathering_with_roles(client, user1, organizer):
    r = client.post('/api/gatherings', headers=_headers(user1), json={
        'what': 'Субботник', 'where': 'Парк', 'date': '2026-08-01', 'time': '10:00',
        'roles': [{'titleRu': 'Фотограф', 'capacity': 1},
                  {'titleRu': 'Раздача мешков', 'capacity': 5, 'newbie': True}],
    })
    assert r.status_code == 201
    roles = r.get_json()['gathering']['roles']
    assert [x['titleRu'] for x in roles] == ['Фотограф', 'Раздача мешков']
    # KZ зеркалится из RU (форма одноязычная), sort = позиция во входном массиве
    assert roles[0]['titleKz'] == 'Фотограф'
    assert roles[1]['newbie'] is True
    assert roles[0]['taken'] == 0 and roles[0]['free'] == 1


def test_create_drops_junk_rows(client, user1, organizer):
    """Кривые строки отбрасываем молча — создание сбора важнее набора ролей."""
    r = client.post('/api/gatherings', headers=_headers(user1), json={
        'what': 'Субботник', 'where': 'Парк', 'date': '2026-08-01', 'time': '10:00',
        'roles': [{'titleRu': '  '}, {'titleRu': 'Фотограф'}, {'titleRu': 'фотограф'}, 'мусор'],
    })
    assert r.status_code == 201
    assert len(r.get_json()['gathering']['roles']) == 1


# ── вместимость ──

def test_capacity_negative_is_clamped(client, user1, organizer):
    """capacity=-1 клампится в 0 («без ограничения»), а не делает роль вечно занятой.

    Без серверного клампа проверка `capacity and taken >= capacity` при -1 истинна всегда,
    и записаться в такую роль стало бы невозможно навсегда.
    """
    r = client.post('/api/gatherings', headers=_headers(user1), json={
        'what': 'Субботник', 'where': 'Парк', 'date': '2026-08-01', 'time': '10:00',
        'roles': [{'titleRu': 'Помощь', 'capacity': -1}],
    })
    role = r.get_json()['gathering']['roles'][0]
    assert role['capacity'] == 0
    assert role['free'] is None          # безлимит не рисует «N из M»


def test_unlimited_role_never_full(client, gathering, roles, user1, user2):
    _, helper = roles
    for u in (user1, user2):
        r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(u),
                       json={'answer': 'yes', 'roleId': helper.id})
        assert r.status_code == 200
    assert db.session.get(GatheringRole, helper.id) is not None
    taken = [x for x in r.get_json()['roles'] if x['id'] == helper.id][0]
    assert taken['taken'] == 2 and taken['free'] is None


def test_role_overflow_returns_409_with_actual_roles(client, gathering, roles, user1, user2):
    photo, _ = roles
    assert client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
                      json={'answer': 'yes', 'roleId': photo.id}).status_code == 200
    r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user2),
                   json={'answer': 'yes', 'roleId': photo.id})
    assert r.status_code == 409
    body = r.get_json()
    assert body['errorKz']                       # KZ-текст обязателен, экран двуязычный
    # актуальный список в теле ошибки — фронт перерисует остатки без второго запроса
    assert [x for x in body['roles'] if x['id'] == photo.id][0]['free'] == 0


def test_maybe_holds_the_slot(client, gathering, roles, user1, user2):
    """«Пока не знаю» место ДЕРЖИТ: иначе сомневающегося вытеснят, пока он думает."""
    photo, _ = roles
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
               json={'answer': 'maybe', 'roleId': photo.id})
    r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user2),
                   json={'answer': 'yes', 'roleId': photo.id})
    assert r.status_code == 409


def test_answer_no_releases_slot(client, gathering, roles, user1, user2):
    photo, _ = roles
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
               json={'answer': 'yes', 'roleId': photo.id})
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1), json={'answer': 'no'})
    r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user2),
                   json={'answer': 'yes', 'roleId': photo.id})
    assert r.status_code == 200


def test_reselect_same_role_is_not_self_conflict(client, gathering, roles, user1):
    """Повторный выбор своей же роли не должен упереться сам в себя на capacity=1."""
    photo, _ = roles
    for _ in range(2):
        r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
                       json={'answer': 'yes', 'roleId': photo.id})
        assert r.status_code == 200


# ── чужие роли и оба пути записи ──

def test_role_from_other_gathering_rejected(client, gathering, roles, user1, user2):
    other = Gathering(code='OTHER1', owner_id=user2.id, title_ru='Другой', title_kz='Басқа',
                      status='open')
    db.session.add(other)
    db.session.flush()
    alien = GatheringRole(gathering_id=other.id, title_ru='Чужая', title_kz='Чужая', capacity=5)
    db.session.add(alien)
    db.session.commit()
    r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
                   json={'answer': 'yes', 'roleId': alien.id})
    assert r.status_code == 400


def test_feed_path_stores_role_too(client, gathering, roles, user1):
    """Путь ленты (PUT /events/<id>/registration) обязан вести себя как гостевой —
    иначе «роль исчезает при записи из ленты»."""
    photo, _ = roles
    r = client.put(f'/api/events/{gathering.id}/registration', headers=_headers(user1),
                   json={'answer': 'yes', 'roleId': photo.id})
    assert r.status_code == 200
    assert r.get_json()['roleId'] == photo.id
    # и роль возвращается при перечитывании
    assert client.get(f'/api/events/{gathering.id}/registration',
                      headers=_headers(user1)).get_json()['roleId'] == photo.id


def test_feed_path_overflow_409(client, gathering, roles, user1, user2):
    photo, _ = roles
    client.put(f'/api/events/{gathering.id}/registration', headers=_headers(user1),
               json={'answer': 'yes', 'roleId': photo.id})
    r = client.put(f'/api/events/{gathering.id}/registration', headers=_headers(user2),
                   json={'answer': 'yes', 'roleId': photo.id})
    assert r.status_code == 409
    assert r.get_json()['roles']


def test_missing_roleid_key_does_not_wipe_role(client, gathering, roles, user1):
    """Ключа нет в теле → роль НЕ трогаем (дозаполняем, не затираем)."""
    photo, _ = roles
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
               json={'answer': 'yes', 'roleId': photo.id})
    r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
                   json={'answer': 'maybe'})
    assert r.get_json()['roleId'] == photo.id


# ── правка набора координатором ──

def test_put_roles_replaces_set(client, gathering, roles, user1):
    photo, helper = roles
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1), json={
        'roles': [{'id': photo.id, 'titleRu': 'Фото и видео', 'capacity': 2}],
    })
    assert r.status_code == 200
    out = r.get_json()['roles']
    assert len(out) == 1                       # helper удалён (его нет во входном наборе)
    assert out[0]['titleRu'] == 'Фото и видео' and out[0]['capacity'] == 2


def test_delete_busy_role_requires_force(client, gathering, roles, user1):
    photo, _ = roles
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
               json={'answer': 'yes', 'roleId': photo.id})
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1),
                   json={'roles': []})
    assert r.status_code == 409
    assert r.get_json()['conflicts'][0]['taken'] == 1

    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1),
                   json={'roles': [], 'force': True})
    assert r.status_code == 200 and r.get_json()['freed'] == 1
    # человек ОСТАЁТСЯ на сборе, но без роли — выкидывать волонтёра из-за правки нельзя
    part = Participant.query.filter_by(gathering_id=gathering.id, user_id=user1.id).first()
    assert part is not None and part.answer == 'yes' and part.role_id is None


def test_capacity_below_taken_rejected(client, gathering, roles, user1, user2):
    _, helper = roles
    for u in (user1, user2):
        client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(u),
                   json={'answer': 'yes', 'roleId': helper.id})
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1), json={
        'roles': [{'id': helper.id, 'titleRu': 'Общая помощь', 'capacity': 1}],
    })
    assert r.status_code == 409                # force-варианта здесь нет вовсе


def test_swap_titles_is_not_a_conflict(client, gathering, roles, user1):
    """Обмен названиями упирался бы в uq_grole_title, если бы порядок операций был
    «вставка до удаления/переименования»."""
    photo, helper = roles
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1), json={
        'roles': [{'id': photo.id, 'titleRu': 'Общая помощь'},
                  {'id': helper.id, 'titleRu': 'Фотограф'}],
    })
    assert r.status_code == 200


def test_recreate_role_with_same_title(client, gathering, roles, user1):
    """Удалить «Фотограф» и добавить «Фотограф» заново — обычный двойной тап по пресету."""
    photo, helper = roles
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1), json={
        'roles': [{'id': helper.id, 'titleRu': 'Общая помощь'}, {'titleRu': 'Фотограф'}],
    })
    assert r.status_code == 200
    fresh = [x for x in r.get_json()['roles'] if x['titleRu'] == 'Фотограф'][0]
    assert fresh['id'] != photo.id            # новая строка, старые привязки не воскресают


def test_duplicate_titles_rejected(client, gathering, user1):
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1), json={
        'roles': [{'titleRu': 'Фото'}, {'titleRu': 'фото'}],
    })
    assert r.status_code == 400


def test_roles_capped_at_max(client, gathering, user1):
    from models import GATHERING_ROLE_MAX
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1), json={
        'roles': [{'titleRu': f'Роль {i}'} for i in range(GATHERING_ROLE_MAX + 5)],
    })
    assert r.status_code == 200
    assert len(r.get_json()['roles']) == GATHERING_ROLE_MAX


def test_finalized_gathering_rejects_role_edits(client, gathering, user1):
    gathering.status = 'done'
    db.session.commit()
    r = client.put(f'/api/gatherings/{gathering.id}/roles', headers=_headers(user1),
                   json={'roles': [{'titleRu': 'Поздно'}]})
    assert r.status_code == 409


# ── устойчивость ──

def test_dangling_role_id_does_not_break_roster(client, gathering, roles, user1):
    """Осиротевший role_id (роль исчезла мимо приложения) не должен ронять сериализатор.

    PRAGMA foreign_keys не включается, поэтому такое состояние физически возможно —
    и это самый частый запрос в приложении.
    """
    photo, _ = roles
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
               json={'answer': 'yes', 'roleId': photo.id})
    db.session.execute(db.text('DELETE FROM gathering_roles WHERE id = :i'), {'i': photo.id})
    db.session.commit()

    r = client.get(f'/api/gatherings/{gathering.id}', headers=_headers(user1))
    assert r.status_code == 200
    part = r.get_json()['gathering']['participants'][0]
    assert part['roleId'] is None and part['roleTitleRu'] is None


def test_gathering_without_roles_registers_in_one_tap(client, gathering, user1):
    """Регресс-защита главного флоу: сбор без ролей ведёт себя ровно как раньше."""
    r = client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
                   json={'answer': 'yes'})
    assert r.status_code == 200
    body = r.get_json()
    assert body['answer'] == 'yes' and body['comingCount'] == 1
    assert body['roles'] == [] and body['roleId'] is None


def test_walkin_guest_may_have_no_role(client, gathering, roles, user1):
    r = client.post(f'/api/gatherings/{gathering.id}/participants', headers=_headers(user1),
                    json={'name': 'Прохожий', 'present': True})
    assert r.status_code == 201
    assert r.get_json()['participant']['roleId'] is None


def test_coordinator_can_overfill_role_in_field(client, gathering, roles, user1, user2):
    """Координатор в поле — авторитет: человек уже стоит перед ним, «мест нет» поздно."""
    photo, _ = roles
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user2),
               json={'answer': 'yes', 'roleId': photo.id})
    walkin = client.post(f'/api/gatherings/{gathering.id}/participants', headers=_headers(user1),
                         json={'name': 'Второй фотограф', 'roleId': photo.id}).get_json()
    r = client.put(f'/api/gatherings/{gathering.id}/participants/'
                   f'{walkin["participant"]["id"]}/role',
                   headers=_headers(user1), json={'roleId': photo.id})
    assert r.status_code == 200
    assert [x for x in r.get_json()['roles'] if x['id'] == photo.id][0]['taken'] == 2


def test_poll_carries_roles_in_both_branches(client, gathering, roles, user1):
    """Состав ролей должен долетать до второго координатора — иначе bump() поднимет
    ревизию, а обновление придёт пустым."""
    rev = gathering.revision or 0
    full = client.get(f'/api/gatherings/{gathering.id}/poll?since=-1', headers=_headers(user1))
    same = client.get(f'/api/gatherings/{gathering.id}/poll?since={rev}', headers=_headers(user1))
    assert len(full.get_json()['roles']) == 2
    assert len(same.get_json()['roles']) == 2


def test_public_view_exposes_only_aggregates(client, gathering, roles, user1):
    """Публичный вид: слот-счётчики можно (тот же класс, что comingCount), имён — нет."""
    client.put(f'/api/g/{gathering.code}/rsvp', headers=_headers(user1),
               json={'answer': 'yes', 'roleId': roles[0].id})
    d = client.get(f'/api/g/{gathering.code}', headers=_headers(user1)).get_json()['gathering']
    assert d['myRoleId'] == roles[0].id
    assert [x for x in d['roles'] if x['id'] == roles[0].id][0]['taken'] == 1
    assert 'participants' not in d and 'forecast' not in d
