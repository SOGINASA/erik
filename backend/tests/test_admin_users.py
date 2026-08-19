"""GET /api/admin/users: серверные фильтр по роли и счётчики.

Регрессия: и фильтр, и чипы считались на клиенте по ОДНОЙ загруженной странице
(20 из ~90). Единственный координатор лежал на пятой странице, поэтому админка
показывала «Координаторы 0», а фильтр по чипу — «Никого не нашли». Читалось это
как «у координаторов пропала роль», хотя роль в БД была на месте.
"""
from models import db, User


def _fill(n, role, prefix):
    """n device-пользователей с ролью role — чтобы список ушёл за одну страницу."""
    db.session.add_all([
        User(device_id=f'{prefix}{i}', full_name=f'{prefix} {i}', role=role,
             user_type='user', is_active=True)
        for i in range(n)
    ])
    db.session.commit()


def test_role_filter_finds_user_past_the_first_page(client, admin_headers):
    """Координатор за пределами первой страницы всё равно находится по фильтру."""
    _fill(25, 'vol', 'v')
    db.session.add(User(device_id='c1', full_name='Асхат Жумабеков', role='coord',
                        user_type='user', is_active=True))
    db.session.commit()

    page1 = client.get('/api/admin/users?page=1', headers=admin_headers).get_json()
    assert len(page1['users']) == 20 and page1['pages'] > 1

    r = client.get('/api/admin/users?role=coord', headers=admin_headers).get_json()
    assert r['total'] == 1
    assert [u['full_name'] for u in r['users']] == ['Асхат Жумабеков']


def test_counts_cover_whole_selection_not_current_page(client, admin_headers):
    """Счётчики чипов — по всей выборке, а не по 20 строкам страницы."""
    _fill(25, 'vol', 'v')
    _fill(3, 'coord', 'c')
    _fill(2, 'org', 'o')

    r = client.get('/api/admin/users?page=1', headers=admin_headers).get_json()
    counts = r['counts']
    assert counts['vol'] == 25 and counts['coord'] == 3 and counts['org'] == 2
    assert counts['all'] == counts['vol'] + counts['coord'] + counts['org'] + counts['admin']


def test_counts_do_not_change_with_selected_role(client, admin_headers):
    """Выбранный чип не должен обнулять остальные — иначе из фильтра не выйти."""
    _fill(5, 'vol', 'v')
    _fill(2, 'coord', 'c')

    all_counts = client.get('/api/admin/users', headers=admin_headers).get_json()['counts']
    coord_counts = client.get('/api/admin/users?role=coord',
                              headers=admin_headers).get_json()['counts']
    assert coord_counts == all_counts


def test_admin_is_counted_apart_from_product_role(client, admin_headers, admin_user):
    """Админ — отдельная строка выдачи, а не второй экземпляр своей роли.

    У админа role='vol' (seed.py, ADMIN_ROLE), и без явного разделения он попадал бы
    и в «Волонтёров» тоже.
    """
    admin_user.role = 'vol'
    db.session.commit()
    _fill(4, 'vol', 'v')

    counts = client.get('/api/admin/users', headers=admin_headers).get_json()['counts']
    assert counts['vol'] == 4          # админ сюда не попал
    assert counts['admin'] == 1

    r = client.get('/api/admin/users?role=admin', headers=admin_headers).get_json()
    assert r['total'] == 1 and r['users'][0]['user_type'] == 'admin'

    r = client.get('/api/admin/users?role=vol', headers=admin_headers).get_json()
    assert all(u['user_type'] != 'admin' for u in r['users'])


def test_role_filter_combines_with_search(client, admin_headers):
    """Поиск и роль сужают выборку вместе, а счётчики считаются по поиску."""
    db.session.add_all([
        User(device_id='c1', full_name='Асхат Жумабеков', role='coord', user_type='user'),
        User(device_id='c2', full_name='Ерлан Мұратов', role='coord', user_type='user'),
        User(device_id='v1', full_name='Асхат Волонтёров', role='vol', user_type='user'),
    ])
    db.session.commit()

    r = client.get('/api/admin/users?search=Асхат&role=coord',
                   headers=admin_headers).get_json()
    assert r['total'] == 1 and r['users'][0]['full_name'] == 'Асхат Жумабеков'
    assert r['counts']['coord'] == 1 and r['counts']['vol'] == 1   # только по поиску


def test_search_is_case_insensitive_for_cyrillic(client, admin_headers):
    """Поиск по русскому имени в любом регистре.

    Регрессия: встроенный lower() в SQLite ASCII-only, поэтому
    lower(full_name) LIKE '%асхат%' не находил «Асхат Жумабеков» никогда — поиск
    в админке работал только по email и нику. Чинится подменой функции
    (models._sqlite_unicode_lower).
    """
    db.session.add(User(device_id='c1', full_name='Асхат Жумабеков', role='coord',
                        user_type='user', is_active=True))
    db.session.commit()

    for q in ('асхат', 'АСХАТ', 'Асхат', 'жумабеков'):
        r = client.get(f'/api/admin/users?search={q}', headers=admin_headers).get_json()
        assert r['total'] == 1, f'поиск «{q}» ничего не нашёл'
        assert r['users'][0]['full_name'] == 'Асхат Жумабеков'


def test_garbage_pagination_does_not_500(client, admin_headers):
    """?page=abc — не повод отдавать 500 (раньше int() кидал ValueError)."""
    for qs in ('?page=abc', '?page=0', '?page=-3', '?per_page=nope'):
        assert client.get('/api/admin/users' + qs, headers=admin_headers).status_code == 200


def test_unknown_role_falls_back_to_all(client, admin_headers):
    """Неизвестная роль не должна отдавать пустой список молча."""
    _fill(3, 'vol', 'v')
    r = client.get('/api/admin/users?role=wat', headers=admin_headers).get_json()
    assert r['total'] == r['counts']['all']
