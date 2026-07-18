"""Детерминированный демо-seed — воспроизводит синтетику фронта (data.js) бит-в-бит.

Тот же LCG (seed 20260718), тот же порядок вызовов rnd(), JS-совместимое округление
(Math.round = floor(x+0.5)) — поэтому серверный прогноз на PARK18 равен фронтовому.
"""
import math
from datetime import datetime, timezone

from models import (
    db, User, Theme, City, Gathering, GatheringCoordinator, Participant, ForecastParams,
)

THEMES = [
    ('eco', 'Экология', 'Экология', '#E8F1EB', '#2F6F4F'),
    ('elderly', 'Помощь пожилым', 'Қарттарға көмек', '#EDE6E8', '#6b4550'),
    ('animals', 'Приюты', 'Баспаналар', '#ECE7DE', '#7a5a2e'),
    ('blood', 'Донорство', 'Донорлық', '#F3E3E1', '#9a3b34'),
    ('edu', 'Образование', 'Білім', '#E4EAEE', '#3d5566'),
    ('trees', 'Озеленение', 'Көгалдандыру', '#E9EAE2', '#565b40'),
    ('homeless', 'Бездомным', 'Панасыздарға', '#E3EBEA', '#356058'),
]

CITIES = [
    ('ast', 'Астана', 'Астана', 53, 33), ('alm', 'Алматы', 'Алматы', 71, 75),
    ('shy', 'Шымкент', 'Шымкент', 52, 88), ('kar', 'Караганда', 'Қарағанды', 56, 47),
    ('pet', 'Петропавловск', 'Петропавл', 47, 9), ('akt', 'Актобе', 'Ақтөбе', 19, 43),
    ('pav', 'Павлодар', 'Павлодар', 65, 28), ('tar', 'Тараз', 'Тараз', 58, 84),
    ('ukk', 'Усть-Каменогорск', 'Өскемен', 84, 38),
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
        # чистим только доменные таблицы, аккаунты/админов не трогаем
        Participant.query.delete()
        GatheringCoordinator.query.delete()
        Gathering.query.filter_by(code='PARK18').delete()
        User.query.filter(User.device_id.like('demo-%')).delete()
        db.session.commit()

    ForecastParams.get()

    for tid, ru, kz, tint, ink in THEMES:
        if not db.session.get(Theme, tid):
            db.session.add(Theme(id=tid, label_ru=ru, label_kz=kz, tint=tint, ink=ink))
    for cid, ru, kz, x, y in CITIES:
        if not db.session.get(City, cid):
            db.session.add(City(id=cid, name_ru=ru, name_kz=kz, map_x=x, map_y=y))
    db.session.commit()

    if Gathering.query.filter_by(code='PARK18').first():
        print('PARK18 уже есть — пропускаю (используй --reset для пересоздания)')
        return

    # координатор-владелец (ME)
    coord = User.query.filter_by(device_id='demo-coord').first()
    if coord is None:
        coord = User(device_id='demo-coord', full_name='Асхат Жумабеков', role='coord',
                     city_id='pet', user_type='user', is_active=True)
        db.session.add(coord)
        db.session.flush()

    gathering = Gathering(
        code='PARK18', owner_id=coord.id, city_id='pet', theme='eco',
        title_ru='Уборка парка на Набережной', title_kz='Жағалау саябағын тазалау',
        place_ru='Парк на Набережной, вход у фонтана',
        place_kz='Жағалау саябағы, фонтан жанындағы кіреберіс',
        starts_at=datetime(2026, 7, 18, 10, 0, tzinfo=timezone.utc),
        needed=20, status='open', ctx=0.95, format='one',
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

    from services.forecast import forecast_payload
    f = forecast_payload(gathering)
    print(f"PARK18 засеян: 45 участников (14 yes / 24 maybe / 7 no)")
    print(f"Прогноз: E={f['E']}  ±{f['sigma']}  [{f['lo']}..{f['hi']}]  ctx={gathering.ctx}")
