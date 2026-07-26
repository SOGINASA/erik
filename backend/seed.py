"""Детерминированный демо-seed — воспроизводит синтетику фронта (data.js) бит-в-бит.

Тот же LCG (seed 20260718), тот же порядок вызовов rnd(), JS-совместимое округление
(Math.round = floor(x+0.5)) — поэтому серверный прогноз на PARK18 равен фронтовому.
"""
import math
import random
from datetime import datetime, timezone, timedelta

from models import (
    db, User, Theme, City, Gathering, GatheringCoordinator, GatheringRole, Participant,
    ForecastParams, Badge, Application,
    Org, CharityRequest, Donation, Follow, AttendanceRecord, Notification, Reminder, BadgeAward,
    Conversation, ConversationMember, Message, Report,
)

# ── Обложки: локальные файлы фронта, по одному на тему (см. COVERS ниже).
# Чтобы поставить конкретную картинку, верните готовый URL из _theme_image/_img
# или задайте image_url явно прямо в вызове конструктора.
THEME_KW = {
    'eco': 'cleanup,park', 'elderly': 'elderly,care', 'animals': 'animal,shelter',
    'blood': 'blood,donation', 'edu': 'tutoring,children', 'trees': 'tree,planting',
    'homeless': 'warm,clothes', 'medical': 'hospital,care', 'disaster': 'flood,rescue',
    'sport': 'city,run', 'culture': 'books,festival', 'it': 'computer,seniors',
}


# Обложки лежат во фронте: front/public/assets/covers/<имя>.jpg — отдаются с его же
# домена. Ни внешних сервисов, ни рейт-лимитов: картинка либо есть в репозитории, либо
# карточка показывает тематический тинт. THEME_KW выше — ключевики, по которым файлы подбирались.
COVERS = '/assets/covers'

# ключевик запроса помощи -> имя файла обложки
CHARITY_IMG = {
    'cleanup,tools': 'charity-tools',
    'warm,clothes': 'charity-clothes',
    'pet,food': 'charity-petfood',
    'books,school': 'charity-books',
}


def _img(keywords):
    return f'{COVERS}/{CHARITY_IMG.get(keywords, "eco")}.jpg'


def _theme_image(theme, code):
    # code больше не влияет на выбор: на каждую тему один файл.
    return f'{COVERS}/{theme if theme in THEME_KW else "eco"}.jpg'


# Жалобы для экрана модерации: (target_type, ru, kz, count)
REPORTS = [
    ('event', 'Событие «Быстрый заработок» похоже на спам', '«Тез табыс» іс-шарасы спам сияқты', 3),
    ('profile', 'Профиль с оскорблениями в чате', 'Чатта дөрекілік көрсеткен профиль', 1),
]

# Города: имя → id (для нормализации free-text из моков).
CITY_ID = {'Алматы': 'alm', 'Астана': 'ast', 'Шымкент': 'shy', 'Караганда': 'kar',
           'Петропавловск': 'pet', 'Актобе': 'akt', 'Павлодар': 'pav', 'Тараз': 'tar',
           'Усть-Каменогорск': 'ukk'}

# НКО: (id, name, cat, city_id, verified, aboutRu, aboutKz)
ORGS = [
    (1, 'Чистый двор', 'eco', 'pet', True,
     'Соседские субботники, уборка дворов, парков и берегов рек.',
     'Көршілік сенбіліктер, аула мен саябақтарды тазалау.'),
    (2, 'Серебряный возраст', 'elderly', 'ast', True,
     'Помощь одиноким пожилым: продукты, уборка, общение.',
     'Жалғызбасты қарттарға көмек: азық-түлік, тазалық, қарым-қатынас.'),
    (3, 'Лапа помощи', 'animals', 'alm', True,
     'Уход за животными в приютах, пристрой, выгул, корм.',
     'Баспаналардағы жануарларға күтім, серуен, жем.'),
    (4, 'Кровь героев', 'blood', 'kar', False,
     'Дни донора и экстренные сборы крови по больницам.',
     'Донор күндері және шұғыл қан жинау.'),
    (5, 'Дети будущего', 'edu', 'shy', True,
     'Наставничество и репетиторство для сельских школьников.',
     'Ауыл оқушыларына тәлімгерлік және репетиторлық.'),
]

# События ленты e2–e8 (e1=PARK18 сеется отдельно): (code, ru, kz, org_id, city, theme,
#   placeRu, placeKz, y, mo, d, hh, mm, format, needed, going)
EVENTS = [
    ('ELD19', 'Навестить одиноких пожилых', 'Жалғыз қарттарды аралау', 2, 'ast', 'elderly',
     'ул. Кенесары 40, сбор у входа', 'Кенесары к. 40', 2026, 7, 19, 11, 0, 'reg', 12, 8),
    ('PAW20', 'День в приюте «Лапа»', 'Баспанадағы күн', 3, 'alm', 'animals',
     'Приют «Лапа», Наурызбайский р-н', '«Лапа» баспанасы', 2026, 7, 20, 9, 0, 'one', 15, 11),
    ('BLD21', 'День донора', 'Донор күні', 4, 'kar', 'blood',
     'Центр крови, пр. Бухар-жырау 12', 'Қан орталығы', 2026, 7, 21, 8, 30, 'one', 30, 22),
    ('EDU24', 'Репетиторство детям', 'Балаларға репетиторлық', 5, 'shy', 'edu',
     'Школа №12, кабинет 3', '№12 мектеп', 2026, 7, 24, 15, 0, 'reg', 8, 5),
    ('TRE25', 'Посадка деревьев в сквере', 'Скверде ағаш отырғызу', 1, 'ast', 'trees',
     'Сквер у ТРЦ «Керуен»', '«Керуен» жанындағы сквер', 2026, 7, 25, 10, 0, 'one', 40, 27),
    ('WRM26', 'Сбор тёплых вещей', 'Жылы киім жинау', 2, 'alm', 'homeless',
     'Пункт сбора, ул. Абая 90', 'Абай к. 90', 2026, 7, 26, 12, 0, 'reg', 10, 6),
    ('RIV27', 'Уборка берега Ишима', 'Есіл жағасын тазалау', 1, 'ast', 'eco',
     'Набережная Ишима, левый берег', 'Есіл жағалауы', 2026, 7, 27, 9, 30, 'one', 25, 14),
]

# Общественные события новых тем (без НКО, ведёт координатор):
#   (code, ru, kz, city, theme, placeRu, placeKz, y, mo, d, hh, mm, format, needed, going)
COMMUNITY_EVENTS = [
    ('MED22', 'Сопровождение в больницу', 'Ауруханаға дейін алып жүру', 'alm', 'medical',
     'Городская поликлиника №4', '№4 қалалық емхана', 2026, 7, 22, 10, 0, 'reg', 10, 6),
    ('DSR23', 'Помощь после паводка', 'Су тасқыннан кейінгі көмек', 'pet', 'disaster',
     'Штаб волонтёров, ул. Мира 3', 'Волонтёр штабы, Мир к. 3', 2026, 7, 23, 9, 0, 'one', 30, 18),
    ('SPT24', 'Волонтёры городского забега', 'Қалалық жүгіру волонтёрлері', 'ast', 'sport',
     'Старт у стелы «Байтерек»', '«Бәйтерек» жанындағы старт', 2026, 7, 24, 8, 0, 'one', 20, 12),
    ('CUL25', 'Фестиваль книг под открытым небом', 'Ашық аспан астындағы кітап фестивалі', 'shy', 'culture',
     'Центральный парк, сцена', 'Орталық саябақ, сахна', 2026, 7, 25, 12, 0, 'one', 15, 9),
    ('ITD26', 'Цифровая грамотность для пожилых', 'Қарттарға цифрлық сауаттылық', 'kar', 'it',
     'Библиотека им. Гоголя', 'Гоголь атындағы кітапхана', 2026, 7, 26, 14, 0, 'reg', 12, 7),
]

# Благотворительность: (titleRu, titleKz, org_id, city, kind, goal, raised, unit, img_kw)
CHARITY = [
    ('Инвентарь для субботников', 'Сенбілікке құрал-жабдық', 1, 'pet', 'money', 150000, 98000, '₸', 'cleanup,tools'),
    ('Тёплые вещи для приюта', 'Баспанаға жылы киім', 2, 'alm', 'items', 200, 134, 'вещей', 'warm,clothes'),
    ('Корм для приюта «Лапа»', '«Лапа» баспанасына жем', 3, 'alm', 'money', 90000, 71500, '₸', 'pet,food'),
    ('Учебники сельским школам', 'Ауыл мектептеріне оқулық', 5, 'shy', 'items', 500, 210, 'книг', 'books,school'),
]

# Волонтёры-лидеры: (name, city_id, hours, events, rel)
VOLUNTEERS = [
    ('Аружан Сапарова', 'alm', 186, 41, 96), ('Ерлан Мұратов', 'ast', 174, 38, 93),
    ('Динара Ким', 'shy', 159, 35, 90), ('Тимур Ли', 'alm', 148, 33, 88),
    ('Гүлнара Ахметова', 'kar', 132, 29, 91), ('Данияр Оспанов', 'ast', 121, 27, 85),
    ('Мария Волкова', 'pet', 108, 24, 89), ('Санжар Тлеу', 'tar', 97, 22, 82),
]

# Диалоги demo-coord: (title, role, other_device_id, [(me, txt, minutes_ago), ...])
CONVOS = [
    ('Чистый двор', 'nko', 'demo-org1', [
        (False, 'Здравствуйте! Спасибо, что записались на субботник 🙌', 185),
        (True, 'Привет! Во сколько сбор?', 182),
        (False, 'В 10:00 у фонтана. Перчатки и мешки будут наши.', 181),
        (True, 'Отлично, буду!', 180)]),
    ('Ерлан Мұратов', 'coordinator', 'demo-v1', [
        (False, 'Можешь взять с собой ещё пару человек?', 1500),
        (True, 'Да, позову соседей', 1495)]),
    ('Лапа помощи', 'nko', 'demo-org3', [
        (False, 'Напоминаем: выгул собак в 9:00', 3000)]),
    ('Серебряный возраст', 'nko', 'demo-org2', [
        (False, 'Апа передаёт вам огромное спасибо ❤', 4300)]),
]

THEMES = [
    ('eco', 'Экология', 'Экология', '#E8F1EB', '#2F6F4F'),
    ('elderly', 'Помощь пожилым', 'Қарттарға көмек', '#EDE6E8', '#6b4550'),
    ('animals', 'Приюты', 'Баспаналар', '#ECE7DE', '#7a5a2e'),
    ('blood', 'Донорство', 'Донорлық', '#F3E3E1', '#9a3b34'),
    ('edu', 'Образование', 'Білім', '#E4EAEE', '#3d5566'),
    ('trees', 'Озеленение', 'Көгалдандыру', '#E9EAE2', '#565b40'),
    ('homeless', 'Бездомным', 'Панасыздарға', '#E3EBEA', '#356058'),
    ('medical', 'Медпомощь', 'Медкөмек', '#E1ECEE', '#2d6674'),
    ('disaster', 'Помощь при ЧС', 'ТЖ көмегі', '#F5E9DB', '#9a5a24'),
    ('sport', 'Спорт', 'Спорт', '#E6E7F1', '#464a82'),
    ('culture', 'Культура', 'Мәдениет', '#EEE6EF', '#6f4a72'),
    ('it', 'IT-волонтёрство', 'IT-волонтёрлік', '#E3E6EE', '#3a4a6b'),
]

CITIES = [
    ('ast', 'Астана', 'Астана', 53, 33), ('alm', 'Алматы', 'Алматы', 71, 75),
    ('shy', 'Шымкент', 'Шымкент', 52, 88), ('kar', 'Караганда', 'Қарағанды', 56, 47),
    ('pet', 'Петропавловск', 'Петропавл', 47, 9), ('akt', 'Актобе', 'Ақтөбе', 19, 43),
    ('pav', 'Павлодар', 'Павлодар', 65, 28), ('tar', 'Тараз', 'Тараз', 58, 84),
    ('ukk', 'Усть-Каменогорск', 'Өскемен', 84, 38),
]

BADGES = [
    ('first', 'Первый выход', 'Алғашқы шығу', '1'),
    ('ten', '10 сборов', '10 жиын', '10'),
    ('reliable', 'Надёжный', 'Сенімді', '✓'),
    ('eco', 'Эко-герой', 'Эко-батыр', '♻'),
    ('night', 'Ночная смена', 'Түнгі ауысым', '☾'),
    ('lead', 'Координатор', 'Үйлестіруші', '★'),
]

NAMES = ['Айгерім', 'Данияр', 'Ольга', 'Тимур', 'Асхат', 'Марина', 'Ерлан', 'Гүлнара',
         'Санжар', 'Настя', 'Азамат', 'Дана', 'Владимир', 'Аружан', 'Кирилл', 'Мадина',
         'Руслан', 'Алия', 'Дмитрий', 'Жанна', 'Нұрлан', 'Виктория', 'Бекзат', 'Елена',
         'Арман', 'Сәуле', 'Максим', 'Динара', 'Олжас', 'Татьяна', 'Ислам', 'Камила',
         'Сергей', 'Айсұлу', 'Дәурен', 'Ксения', 'Ерасыл', 'Гаухар', 'Антон', 'Меруерт',
         'Тимофей', 'Әсел', 'Данил', 'Жанія', 'Ринат']


def _js_round(x):
    return math.floor(x + 0.5)   # Math.round для положительных


def _demo_user(device_id, **fields):
    """Демо-личность по device_id: создать или ДОЗАПОЛНИТЬ существующую.

    Слепой INSERT ронял весь сид на UNIQUE(device_id) — и хватало одного клика по
    кнопке быстрого входа на незасеянной базе: POST /session заводил demo-v0 пустой
    строкой (без имени, role='vol'), после чего `flask seed-demo` падал, и база
    чинилась только через --reset. Пустышку надо не обходить, а дозаполнять: это ТА
    ЖЕ личность, сид просто возвращает ей настоящие имя, роль и статистику.

    Побочный эффект намеренный: сид становится идемпотентным и его можно гонять
    повторно — это условие автосида при деплое (entrypoint.sh).
    """
    u = User.query.filter_by(device_id=device_id).first()
    if u is None:
        u = User(device_id=device_id, **fields)
        db.session.add(u)
    else:
        for key, value in fields.items():
            setattr(u, key, value)
    db.session.flush()
    return u


def build_participants():
    """Порт data.js buildParticipants() — идентичная последовательность rnd()."""
    s = 20260718 & 0xFFFFFFFF

    def rnd():
        nonlocal s
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        return s / 4294967296

    answers = ['yes'] * 14 + ['maybe'] * 24 + ['no'] * 7
    keyed = [(a, rnd()) for a in answers]              # 45 rnd() — ключи сортировки
    keyed.sort(key=lambda o: o[1])
    order = [o[0] for o in keyed]

    out = []
    for i, name in enumerate(NAMES):
        answer = order[i]
        total = int(rnd() * 6)                          # floor
        if total == 0:
            came = 0
        else:
            reliable = rnd()
            if answer == 'yes':
                rate = 0.55 + reliable * 0.45
            elif answer == 'maybe':
                rate = 0.15 + reliable * 0.6
            else:
                rate = 0.05 + reliable * 0.4
            came = min(total, _js_round(total * rate))
        p1 = int(rnd() * 90) + 10
        p2 = int(rnd() * 900) + 100
        p3 = int(rnd() * 90) + 10
        p4 = int(rnd() * 90) + 10
        phone = f'+7 7{p1} {p2} {p3}{p4}'
        out.append({'name': name, 'answer': answer, 'phone': phone, 'total': total, 'came': came})
    return out


def seed_demo(reset=False):
    if reset:
        # ⚠️ reset ПОЛНОСТЬЮ очищает доменные таблицы (все сборы/НКО/помощь/уведомления),
        # а не только demo-строки. Аккаунты email/пароль (напр. админ) сохраняются.
        # Это команда пересборки ДЕМО-базы — не запускать на данных, которые нужно сохранить.
        # Порядок FK-безопасный: дети раньше родителей. Participant ссылается на
        # GatheringRole, поэтому роли чистим ПОСЛЕ участников и ДО сборов.
        # Application тут раньше не было вовсе — заявки переживали reset и висели
        # на удалённых сборах (штаб организатора показывал их на пустоту).
        for M in (Message, ConversationMember, Conversation, Report,
                  Donation, CharityRequest, Follow, Notification, Reminder, BadgeAward,
                  AttendanceRecord, Application, Participant, GatheringRole,
                  GatheringCoordinator, Gathering):
            M.query.delete()
        Org.query.delete()
        User.query.filter(User.device_id.like('demo-%')).delete()
        db.session.commit()

    ForecastParams.get()

    for tid, ru, kz, tint, ink in THEMES:
        if not db.session.get(Theme, tid):
            db.session.add(Theme(id=tid, label_ru=ru, label_kz=kz, tint=tint, ink=ink))
    for cid, ru, kz, x, y in CITIES:
        if not db.session.get(City, cid):
            db.session.add(City(id=cid, name_ru=ru, name_kz=kz, map_x=x, map_y=y))
    for bid, ru, kz, glyph in BADGES:
        if not db.session.get(Badge, bid):
            db.session.add(Badge(id=bid, label_ru=ru, label_kz=kz, glyph=glyph))
    db.session.commit()

    # У ОБОИХ админов role='vol'. Админство живёт в user_type, а role — это продуктовая
    # роль в приложении, и ставить админу 'org' или 'coord' значит подмешать ему чужой
    # кабинет: сайдбар нарисует «Создать помощь» и «Моя НКО» (Shell.jsx) организации,
    # которой у него нет, а штаб координатора откроется пустым. При 'vol' навигация
    # админа чистая — обычное приложение плюс пункт «Админка», — потому что
    # волонтёрские пункты и так скрыты под !isAdmin.
    ADMIN_ROLE = 'vol'

    # админ-АККАУНТ (email/пароль) — чтобы работал вход администратора через ФОРМУ логина.
    # Демо-креды: admin@erik.kz / admin123. В проде — flask create-admin с уникальным паролем.
    if not User.query.filter_by(email='admin@erik.kz').first():
        admin_acc = User(email='admin@erik.kz', full_name='Администратор erik',
                         role=ADMIN_ROLE, city_id='ast',
                         user_type='admin', is_active=True, is_verified=True)
        admin_acc.set_password('admin123')
        db.session.add(admin_acc)
        db.session.commit()

    # демо-АДМИН как отдельная device-личность: кнопка «Войти как администратор» ведёт
    # СЮДА. demo-coord теперь обычный координатор (без доступа к модерации).
    # Через _demo_user, а не «создать, если нет»: пустышку от клика по кнопке быстрого
    # входа надо ДОЗАПОЛНИТЬ. Пропуская существующую строку, сид оставлял бы админа
    # без имени и без user_type='admin' — то есть админку он бы так и не увидел.
    _demo_user('demo-admin', full_name='Администратор erik',
               role=ADMIN_ROLE, city_id='ast', user_type='admin', is_active=True)
    db.session.commit()

    if Gathering.query.filter_by(code='PARK18').first():
        print('PARK18 уже есть — пропускаю (используй --reset для пересоздания)')
        return

    # координатор-владелец (ME) со статами профиля
    # Обычный координатор (НЕ админ): модерация вынесена в отдельного demo-admin.
    # Дозаполняем, а не «создаём если нет»: иначе пустышка от кнопки «Координатор»
    # так и оставалась бы без имени и с role='vol' — ровно симптом «у координатора нет роли».
    coord = _demo_user('demo-coord', full_name='Асхат Жумабеков', role='coord',
                       city_id='pet', user_type='user', is_active=True,
                       hours_total=47, events_attended=12, reliability=91, rank=34,
                       skills=['Организация', 'Первая помощь', 'Водитель кат. B', 'Фото'])

    gathering = Gathering(
        code='PARK18', owner_id=coord.id, city_id='pet', theme='eco',
        title_ru='Уборка парка на Набережной', title_kz='Жағалау саябағын тазалау',
        place_ru='Парк на Набережной, вход у фонтана',
        place_kz='Жағалау саябағы, фонтан жанындағы кіреберіс',
        # Дата ОТНОСИТЕЛЬНАЯ, а не 18.07.2026: с захардкоженной датой демо-сбор со
        # временем протухал — оказывался в прошлом, уезжал в «прошедшие», выпадал из
        # активных (сводка штаба показывала нули) и попадал в бэктест как сбор с
        # нулевой явкой. Фронтовое демо (data.js:demoDate) считает дату так же.
        starts_at=(datetime.now(timezone.utc) + timedelta(days=1)).replace(
            hour=10, minute=0, second=0, microsecond=0, tzinfo=None),
        needed=20, status='open', ctx=0.95, format='one',
        image_url=_theme_image('eco', 'PARK18'),
    )
    db.session.add(gathering)
    db.session.flush()
    db.session.add(GatheringCoordinator(gathering_id=gathering.id, user_id=coord.id, role='owner'))

    # Роли волонтёров: на демо должно быть видно и закрытую роль («Фотограф 1 из 1»),
    # и живой добор, и группу «без роли» — иначе экран ролей выглядит пустой заглушкой.
    park_roles = [
        # Вместимость с запасом: на демо должны быть видны все три состояния роли —
        # есть места, есть места, разобрана. Забитый под завязку список не даёт
        # показать сам выбор роли волонтёром.
        GatheringRole(gathering_id=gathering.id, title_ru='Раздача мешков и перчаток',
                      title_kz='Қап пен қолғап тарату', capacity=6, newbie=True,
                      preset='eco:bags', sort=0),
        GatheringRole(gathering_id=gathering.id, title_ru='Сортировка мусора',
                      title_kz='Қоқысты сұрыптау', capacity=12, newbie=True,
                      preset='eco:sort', sort=1),
        GatheringRole(gathering_id=gathering.id, title_ru='Фотограф',
                      title_kz='Фотограф', capacity=1, preset='eco:photo', sort=2),
    ]
    db.session.add_all(park_roles)
    db.session.flush()
    # Детерминированная раздача: каждый третий остаётся «без роли» — так на экране
    # координатора сразу видно, что роль необязательна, а не «у всех проставлена».
    role_cycle = [park_roles[0], park_roles[1], None, park_roles[1], None, park_roles[2]]
    # Заполняем НЕ до потолка: цель по каждой роли ниже вместимости, чтобы на демо
    # остался живой добор («4 из 6») рядом с разобранной ролью («Фотограф 1 из 1»).
    role_target = {park_roles[0].id: 4, park_roles[1].id: 8, park_roles[2].id: 1}
    role_taken = {}

    def _take_role(index, answer):
        """Роль из цикла, пока не набрана цель. Место занимают только yes/maybe —
        так же, как считает services/roles.role_counts."""
        if answer not in ('yes', 'maybe'):
            return None
        role = role_cycle[index % len(role_cycle)]
        if role is None:
            return None
        if role_taken.get(role.id, 0) >= role_target.get(role.id, 0):
            return None
        role_taken[role.id] = role_taken.get(role.id, 0) + 1
        return role.id

    for i, p in enumerate(build_participants()):
        # лёгкий device-User с историей = основа для обучения trust
        u = _demo_user(f'demo-p{i}', full_name=p['name'], phone=p['phone'], role='vol',
                       user_type='user', is_active=True,
                       trust_total=p['total'], trust_came=p['came'],
                       reliability=round(100 * p['came'] / p['total']) if p['total'] else 0,
                       events_attended=p['came'])
        db.session.add(Participant(
            gathering_id=gathering.id, user_id=u.id, name=p['name'], phone=p['phone'],
            answer=p['answer'], hist_total_at_rsvp=p['total'], hist_came_at_rsvp=p['came'],
            answered_at=datetime.now(timezone.utc),
            role_id=_take_role(i, p['answer']),
        ))

    db.session.commit()

    # PARK18 (e1) как событие ленты — привязываем к НКО «Чистый двор».
    # going_cache НЕ ставим: у PARK18 реальный ростер, going считается по нему (14 «да»).
    gathering.org_id = 1

    _seed_platform()
    db.session.commit()

    # Прошедшие сборы с реальным журналом явки. Без них /me/org/analytics отдавал
    # forecastAccuracy=null, hoursTotal=0 и пустой топ волонтёров: проверить точность
    # прогноза было не на чем, а именно она и есть ответ на вопрос «это модель или
    # формула». Здесь появляется история, на которой считается бэктест.
    _seed_history(coord)

    # Чужие RSVP демо-личностей — чтобы «Мои мероприятия» не были пустыми.
    # Координатор записан НАРАВНЕ с волонтёром и именно на ЧУЖИЕ сборы (НКО-шные, не
    # свои): роль в erik это прогрессия, а не режим — получив coord, человек не
    # перестаёт ходить волонтёром. Без этих строк экран координатора выглядел бы
    # пустым, и починенный пункт меню читался бы как всё ещё сломанный.
    for dev, rsvps in (
        ('demo-v0', [('ELD19', 'yes'), ('PAW20', 'maybe'), ('BLD21', 'yes')]),
        ('demo-coord', [('TRE25', 'yes'), ('BLD21', 'maybe')]),
    ):
        u = User.query.filter_by(device_id=dev).first()
        if u is None:
            continue
        for code, ans in rsvps:
            gv = Gathering.query.filter_by(code=code).first()
            if gv and not Participant.query.filter_by(gathering_id=gv.id, user_id=u.id).first():
                db.session.add(Participant(gathering_id=gv.id, user_id=u.id, name=u.full_name,
                                           answer=ans, answered_at=datetime.now(timezone.utc)))
        db.session.commit()

    # демо-уведомления координатору (лента не должна быть пустой на защите)
    # NB: Notification импортируется на уровне модуля. Локальный `from models import
    # Notification` здесь делал имя локальным для ВСЕЙ функции и ронял блок reset выше.
    if not Notification.query.filter_by(user_id=coord.id).first():
        demo_notifs = [
            ('answer', 'Айгерім ответила «Приду» на «Уборка парка на Набережной»', 'Айгерім «Келемін» деп жауап берді'),
            ('reminder', 'Завтра в 10:00 — «Уборка парка на Набережной»', 'Ертең 10:00 — «Жағалау саябағын тазалау»'),
            ('badge', 'Вы получили бейдж «Эко-герой»', '«Эко-батыр» бейджін алдыңыз'),
            ('event', '«Дети будущего» открыли новый сбор рядом', '«Дети будущего» жақын жерде жаңа жиын ашты'),
            ('system', 'НКО «Чистый двор» подтвердила ваши 6 часов', '«Чистый двор» 6 сағатыңызды растады'),
        ]
        for ntype, ru, kz in demo_notifs:
            db.session.add(Notification(user_id=coord.id, type=ntype, text_ru=ru, text_kz=kz))
        db.session.commit()

    from services.forecast import forecast_payload
    f = forecast_payload(gathering)
    print(f"PARK18 засеян: 45 участников (14 yes / 24 maybe / 7 no)")
    print(f"Прогноз: E={f['E']}  ±{f['sigma']}  [{f['lo']}..{f['hi']}]  ctx={gathering.ctx}")
    print(f"Платформа: {Org.query.count()} НКО, {Gathering.query.count()} событий, "
          f"{CharityRequest.query.count()} сборов помощи, {User.query.filter(User.device_id.like('demo-v%')).count()} волонтёров")


# ── прошедшие сборы: история явки, на которой считается бэктест точности ──

# Пул волонтёров истории — отдельные от ростера PARK18 (demo-p*), чтобы их
# захардкоженный trust не пересчитывался финализацией.
_HIST_NAMES = [
    'Айдана Серік', 'Ерасыл Қуаныш', 'Полина Ким', 'Нұрсұлтан Абай', 'Дарья Ким',
    'Мирас Жанат', 'Алина Пак', 'Бекарыс Төлеу', 'Софья Ли', 'Ұлан Серғазы',
    'Карина Ким', 'Диас Бейбіт', 'Милана Ким', 'Санжар Асыл', 'Аружан Дәулет',
    'Тимур Ким', 'Аяулым Ерлан', 'Даниял Мұрат', 'Инкар Асқар', 'Артём Ким',
    'Жанель Бақыт', 'Рустам Ким', 'Ділназ Ерік', 'Алишер Ким', 'Томирис Асан',
    'Марат Ким', 'Айсұлу Нұрлан', 'Владислав Ким', 'Гүлназ Ерсін', 'Ильяс Ким',
]

# (код, ru, kz, тема, сколько дней назад, needed)
_HIST_EVENTS = [
    ('OLD01', 'Субботник в парке Победы', 'Жеңіс саябағындағы сенбілік', 'eco', 152, 25),
    ('OLD02', 'Навестить одиноких пожилых', 'Жалғыз қарттарды аралау', 'elderly', 124, 12),
    ('OLD03', 'День в приюте «Лапа»', '«Лапа» баспанасындағы күн', 'animals', 96, 15),
    ('OLD04', 'Посадка деревьев в сквере', 'Скверде ағаш отырғызу', 'trees', 68, 30),
    ('OLD05', 'Репетиторство детям', 'Балаларға репетиторлық', 'edu', 41, 10),
    ('OLD06', 'Очистка берега озера', 'Көл жағасын тазалау', 'eco', 20, 20),
    ('OLD07', 'Сбор тёплых вещей', 'Жылы киім жинау', 'homeless', 9, 14),
]

_HIST_THEMES = ['eco', 'elderly', 'animals', 'trees', 'edu', 'homeless']


def _seed_history(coord):
    """Прошедшие сборы координатора с полным циклом: RSVP → явка → журнал.

    Явка разыгрывается генеративным правилом (латентная надёжность волонтёра +
    совпадение темы с его интересами + эффект ответа + шум) — тем же по смыслу,
    что в ml/data_gen.py. Модель этих скрытых параметров не видит: ей достаётся
    только наблюдаемая история, и бэктест честно меряет, насколько она её угадала.

    Всё детерминировано (фиксированное зерно), чтобы демо воспроизводилось.
    """
    from services.forecast import finalize_gathering

    if Gathering.query.filter_by(code='OLD01').first():
        return

    rnd = random.Random(20260726)
    now = datetime.now(timezone.utc)

    # ── пул волонтёров с «характером» ──
    people = []
    for i, name in enumerate(_HIST_NAMES):
        # Смесь профилей: часть народа надёжная, часть «плюсует в чат, но не доходит».
        reliability = rnd.betavariate(1.6, 4.6) if rnd.random() < 0.38 else rnd.betavariate(4.6, 1.6)
        interests = rnd.sample(_HIST_THEMES, rnd.randint(1, 3))
        u = _demo_user(f'demo-hv{i}', full_name=name, role='vol', city_id='pet',
                       user_type='user', is_active=True, interests=interests)
        people.append({'user': u, 'rel': reliability, 'interests': interests})
    db.session.commit()

    for code, ru, kz, theme, days_ago, needed in _HIST_EVENTS:
        starts = now - timedelta(days=days_ago)
        g = Gathering(
            code=code, owner_id=coord.id, city_id='pet', theme=theme, org_id=1,
            title_ru=ru, title_kz=kz,
            place_ru='Петропавловск', place_kz='Петропавл',
            starts_at=starts.replace(tzinfo=None) if starts.tzinfo else starts,
            needed=needed, status='open', ctx=1.0, format='one',
            image_url=_theme_image(theme, code),
        )
        db.session.add(g)
        db.session.flush()
        db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=coord.id, role='owner'))

        invited = rnd.sample(people, rnd.randint(18, min(28, len(people))))
        for person in invited:
            u = person['user']
            match = 1 if theme in person['interests'] else 0

            # RSVP: надёжные и «свои по теме» чаще отвечают «приду»
            bias = 0.9 * person['rel'] + 0.5 * match
            r = rnd.random()
            answer = 'yes' if r < 0.30 + 0.35 * bias else ('maybe' if r < 0.85 else 'no')

            # Снапшот истории НА МОМЕНТ RSVP — то, что видел бы прогноз до сбора.
            hist_total = u.trust_total or 0
            hist_came = u.trust_came or 0

            # Пришёл или нет — скрытая «правда», модели она недоступна.
            score = (person['rel'] - 0.5) * 2.2 + 0.45 * match + rnd.gauss(0, 0.28) + {
                'yes': 0.55, 'maybe': -0.15, 'no': -1.6}[answer]
            came = score > 0

            db.session.add(Participant(
                gathering_id=g.id, user_id=u.id, name=u.full_name, phone=None,
                answer=answer, presence='came' if came else None,
                hist_total_at_rsvp=hist_total, hist_came_at_rsvp=hist_came,
                answered_at=starts, checked_in_at=starts if came else None,
            ))
        db.session.commit()

        # finalize сам проставит presence остальным, запишет журнал и обучит trust —
        # ровно тот же путь, которым сбор закрывается в проде.
        finalize_gathering(g)

    print(f'История: {len(_HIST_EVENTS)} завершённых сборов, '
          f'{AttendanceRecord.query.count()} записей журнала явки')


def _seed_platform():
    """НКО, события ленты e2–e8, благотворительность, волонтёры-лидеры."""
    # НКО + их владельцы
    for oid, name, cat, city, verified, aboutRu, aboutKz in ORGS:
        owner = _demo_user(f'demo-org{oid}', full_name=name, role='org',
                           city_id=city, user_type='user', is_active=True)
        db.session.add(Org(id=oid, name=name, cat=cat, city_id=city, verified=verified,
                           about_ru=aboutRu, about_kz=aboutKz, owner_id=owner.id))
    db.session.flush()

    org_owner = {o.id: o.owner_id for o in Org.query.all()}

    # события ленты (e2–e8) как открытые сборы
    for code, ru, kz, org_id, city, theme, placeRu, placeKz, y, mo, d, hh, mm, fmt, needed, going in EVENTS:
        g = Gathering(
            code=code, owner_id=org_owner[org_id], org_id=org_id, city_id=city, theme=theme,
            title_ru=ru, title_kz=kz, place_ru=placeRu, place_kz=placeKz,
            starts_at=datetime(y, mo, d, hh, mm, tzinfo=timezone.utc),
            format=fmt, needed=needed, status='open', ctx=1.0, going_cache=going,
            image_url=_theme_image(theme, code),
        )
        db.session.add(g)
        db.session.flush()
        db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=org_owner[org_id], role='owner'))

    # общественные события новых тем (ведёт координатор, без НКО)
    coord = User.query.filter_by(device_id='demo-coord').first()
    if coord is not None:
        for code, ru, kz, city, theme, placeRu, placeKz, y, mo, d, hh, mm, fmt, needed, going in COMMUNITY_EVENTS:
            g = Gathering(
                code=code, owner_id=coord.id, org_id=None, city_id=city, theme=theme,
                title_ru=ru, title_kz=kz, place_ru=placeRu, place_kz=placeKz,
                starts_at=datetime(y, mo, d, hh, mm, tzinfo=timezone.utc),
                format=fmt, needed=needed, status='open', ctx=1.0, going_cache=going,
                image_url=_theme_image(theme, code),
            )
            db.session.add(g)
            db.session.flush()
            db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=coord.id, role='owner'))

    # благотворительность
    for titleRu, titleKz, org_id, city, kind, goal, raised, unit, img_kw in CHARITY:
        db.session.add(CharityRequest(title_ru=titleRu, title_kz=titleKz, org_id=org_id,
                                      city_id=city, kind=kind, goal=goal, raised=raised, unit=unit,
                                      image_url=_img(img_kw)))

    # волонтёры-лидеры
    for i, (name, city, hours, events, rel) in enumerate(VOLUNTEERS):
        _demo_user(f'demo-v{i}', full_name=name, role='vol',
                   city_id=city, user_type='user', is_active=True,
                   hours_total=hours, events_attended=events, reliability=rel,
                   rank=i + 1)

    # диалоги demo-coord с НКО/координаторами
    coord = User.query.filter_by(device_id='demo-coord').first()
    if coord is not None:
        for title, role, other_dev, msgs in CONVOS:
            other = User.query.filter_by(device_id=other_dev).first()
            if other is None:
                continue
            convo = Conversation(title=title, role=role)
            db.session.add(convo)
            db.session.flush()
            db.session.add(ConversationMember(conversation_id=convo.id, user_id=coord.id))
            db.session.add(ConversationMember(conversation_id=convo.id, user_id=other.id))
            for me, txt, mins in msgs:
                db.session.add(Message(
                    conversation_id=convo.id,
                    sender_id=coord.id if me else other.id,
                    body=txt,
                    created_at=datetime.now(timezone.utc) - timedelta(minutes=mins),
                ))

    # жалобы для модерации
    for target, ru, kz, count in REPORTS:
        db.session.add(Report(target_type=target, text_ru=ru, text_kz=kz, count=count, status='open'))
