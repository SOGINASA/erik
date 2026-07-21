"""Детерминированный демо-seed — воспроизводит синтетику фронта (data.js) бит-в-бит.

Тот же LCG (seed 20260718), тот же порядок вызовов rnd(), JS-совместимое округление
(Math.round = floor(x+0.5)) — поэтому серверный прогноз на PARK18 равен фронтовому.
"""
import math
from datetime import datetime, timezone, timedelta

from models import (
    db, User, Theme, City, Gathering, GatheringCoordinator, Participant, ForecastParams, Badge,
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
        for M in (Message, ConversationMember, Conversation, Report,
                  Donation, CharityRequest, Follow, Notification, Reminder, BadgeAward,
                  AttendanceRecord, Participant, GatheringCoordinator, Gathering):
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

    # админ-АККАУНТ (email/пароль) — чтобы работал вход администратора через ФОРМУ логина.
    # Демо-креды: admin@erik.kz / admin123. В проде — flask create-admin с уникальным паролем.
    if not User.query.filter_by(email='admin@erik.kz').first():
        admin_acc = User(email='admin@erik.kz', full_name='Администратор erik',
                         user_type='admin', is_active=True, is_verified=True)
        admin_acc.set_password('admin123')
        db.session.add(admin_acc)
        db.session.commit()

    # демо-АДМИН как отдельная device-личность: кнопка «Войти как администратор» ведёт
    # СЮДА. demo-coord теперь обычный координатор (без доступа к модерации).
    if not User.query.filter_by(device_id='demo-admin').first():
        db.session.add(User(device_id='demo-admin', full_name='Администратор erik',
                            role='org', city_id='ast', user_type='admin', is_active=True))
        db.session.commit()

    if Gathering.query.filter_by(code='PARK18').first():
        print('PARK18 уже есть — пропускаю (используй --reset для пересоздания)')
        return

    # координатор-владелец (ME) со статами профиля
    coord = User.query.filter_by(device_id='demo-coord').first()
    if coord is None:
        # Обычный координатор (НЕ админ): модерация вынесена в отдельного demo-admin.
        coord = User(device_id='demo-coord', full_name='Асхат Жумабеков', role='coord',
                     city_id='pet', user_type='user', is_active=True,
                     hours_total=47, events_attended=12, reliability=91, rank=34,
                     skills=['Организация', 'Первая помощь', 'Водитель кат. B', 'Фото'])
        db.session.add(coord)
        db.session.flush()

    gathering = Gathering(
        code='PARK18', owner_id=coord.id, city_id='pet', theme='eco',
        title_ru='Уборка парка на Набережной', title_kz='Жағалау саябағын тазалау',
        place_ru='Парк на Набережной, вход у фонтана',
        place_kz='Жағалау саябағы, фонтан жанындағы кіреберіс',
        starts_at=datetime(2026, 7, 18, 10, 0, tzinfo=timezone.utc),
        needed=20, status='open', ctx=0.95, format='one',
        image_url=_theme_image('eco', 'PARK18'),
    )
    db.session.add(gathering)
    db.session.flush()
    db.session.add(GatheringCoordinator(gathering_id=gathering.id, user_id=coord.id, role='owner'))

    for i, p in enumerate(build_participants()):
        # лёгкий device-User с историей = основа для обучения trust
        u = User(device_id=f'demo-p{i}', full_name=p['name'], phone=p['phone'], role='vol',
                 user_type='user', is_active=True,
                 trust_total=p['total'], trust_came=p['came'],
                 reliability=round(100 * p['came'] / p['total']) if p['total'] else 0,
                 events_attended=p['came'])
        db.session.add(u)
        db.session.flush()
        db.session.add(Participant(
            gathering_id=gathering.id, user_id=u.id, name=p['name'], phone=p['phone'],
            answer=p['answer'], hist_total_at_rsvp=p['total'], hist_came_at_rsvp=p['came'],
            answered_at=datetime.now(timezone.utc),
        ))

    db.session.commit()

    # PARK18 (e1) как событие ленты — привязываем к НКО «Чистый двор».
    # going_cache НЕ ставим: у PARK18 реальный ростер, going считается по нему (14 «да»).
    gathering.org_id = 1

    _seed_platform()
    db.session.commit()

    # демо-волонтёр (demo-v0) записан на пару событий ленты — чтобы «Мои мероприятия»
    # были не пустыми при входе как «Волонтёр».
    vol = User.query.filter_by(device_id='demo-v0').first()
    if vol is not None:
        for code, ans in [('ELD19', 'yes'), ('PAW20', 'maybe'), ('BLD21', 'yes')]:
            gv = Gathering.query.filter_by(code=code).first()
            if gv and not Participant.query.filter_by(gathering_id=gv.id, user_id=vol.id).first():
                db.session.add(Participant(gathering_id=gv.id, user_id=vol.id, name=vol.full_name,
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


def _seed_platform():
    """НКО, события ленты e2–e8, благотворительность, волонтёры-лидеры."""
    # НКО + их владельцы
    for oid, name, cat, city, verified, aboutRu, aboutKz in ORGS:
        owner = User(device_id=f'demo-org{oid}', full_name=name, role='org',
                     city_id=city, user_type='user', is_active=True)
        db.session.add(owner)
        db.session.flush()
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
        db.session.add(User(device_id=f'demo-v{i}', full_name=name, role='vol',
                            city_id=city, user_type='user', is_active=True,
                            hours_total=hours, events_attended=events, reliability=rel,
                            rank=i + 1))
    db.session.flush()

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
