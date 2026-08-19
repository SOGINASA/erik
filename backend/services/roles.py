"""Роли волонтёров на сборе — единственная точка записи.

Записаться на сбор можно из ЧЕТЫРЁХ мест: guest.put_rsvp (по коду/ссылке),
platform.set_registration (лента), organizer accept заявки и walk-in add_guest. Если
проверять принадлежность роли сбору и вместимость в каждом из них по отдельности, они
неизбежно разъедутся — у этого проекта уже есть такой шрам (guest отдаёт comingCount,
platform — going; guest дозаполняет name/phone, platform — нет). Поэтому вся логика
живёт здесь, а роуты только вызывают pick_role/release_role/apply_roles.

Занятым место считается при answer ∈ (yes, maybe): «maybe» место ДЕРЖИТ — иначе
сомневающегося вытеснят, пока он думает, и он вернётся к закрытой роли.
"""
from models import db, GatheringRole, Participant, GATHERING_ROLE_MAX, ROLE_TITLE_MAX, ROLE_CAPACITY_MAX

# Ответы, при которых участник занимает место в роли.
HOLDING_ANSWERS = ('yes', 'maybe')


def clamp_capacity(value, default=1):
    """0..99; 0 = «без ограничения». По образцу _clamp_needed (routes/gatherings.py).

    Кламп именно на сервере: отрицательная вместимость ломает саму проверку занятости
    (`capacity and taken >= capacity` при capacity=-5 истинно всегда), и роль оказалась бы
    занята навсегда. Клиентский кламп в Stepper'е от прямого запроса не защищает.
    """
    try:
        return max(0, min(ROLE_CAPACITY_MAX, int(value)))
    except (ValueError, TypeError):
        return default


def clean_title(value):
    """Название роли: строка, обрезанная по длине колонки. Пусто → None (строку пропускаем)."""
    return (str(value or '').strip()[:ROLE_TITLE_MAX]) or None


def role_counts(gathering):
    """{role_id: занято} по ростеру. Второго счётчика в схеме нет намеренно —
    он разъехался бы с ростером при первом же remove_participant."""
    out = {}
    for p in gathering.participants:
        if p.role_id and p.answer in HOLDING_ANSWERS:
            out[p.role_id] = out.get(p.role_id, 0) + 1
    return out


def is_full(role, taken):
    """capacity=0 — безлимитная роль, она не бывает занята никогда."""
    return bool(role.capacity) and taken >= role.capacity


def find_role(gathering, role_id):
    """Роль ЭТОГО сбора по id. FK принадлежность не гарантирует — прислать чужой roleId
    может кто угодно, и без явной проверки волонтёр занял бы слот на другом мероприятии."""
    try:
        rid = int(role_id)
    except (ValueError, TypeError):
        return None
    for r in gathering.roles:
        if r.id == rid:
            return r
    return None


def pick_role(gathering, participant, role_id):
    """Поставить участника в роль. → (ok, err_ru, err_kz, status).

    role_id None/'' → снять роль. Роль чужого сбора → 400. Мест нет → 409 (свою текущую
    роль в занятость не считаем, иначе смена «Фотограф → Фотограф» упрётся сама в себя).
    """
    if role_id in (None, '', 0):
        participant.role_id = None
        return True, None, None, None

    role = find_role(gathering, role_id)
    if role is None:
        return False, 'Роль не найдена на этом сборе', 'Бұл жиында мұндай рөл жоқ', 400

    if participant.role_id == role.id:
        return True, None, None, None

    if participant.answer in HOLDING_ANSWERS:
        taken = role_counts(gathering).get(role.id, 0)
        if is_full(role, taken):
            return False, 'Эту роль уже разобрали', 'Бұл рөлді алып қойды', 409

    participant.role_id = role.id
    return True, None, None, None


def release_role(participant):
    """Освободить место. Зовётся везде, где ответ становится 'no' — иначе место держит
    человек, который уже сказал, что не придёт."""
    participant.role_id = None


def drop_role_links(gathering, role_ids):
    """Отвязать участников от удаляемых ролей ЯВНЫМ UPDATE. → сколько освободили.

    Полагаться на ondelete='SET NULL' нельзя: PRAGMA foreign_keys в приложении нигде не
    включается, на SQLite каскад молча не срабатывает и в participants остались бы
    осиротевшие role_id.
    """
    if not role_ids:
        return 0
    freed = 0
    for p in gathering.participants:
        if p.role_id in role_ids:
            p.role_id = None
            freed += 1
    return freed


def apply_roles(gathering, rows, force=False):
    """Заменить НАБОР ролей целиком. → (ok, payload_or_error, status).

    rows: [{id?, titleRu, titleKz?, capacity?, newbie?, preset?}] — со своим id это правка,
    без id новая роль, отсутствующий id означает удаление.

    Порядок операций важен: сначала удаляем, потом переименовываем, только потом вставляем.
    Иначе обычные действия («удалить Фотографа и добавить Фотографа заново» — а именно так
    выглядит двойной тап по чипу пресета, «поменять названия двух ролей местами») упёрлись
    бы в uq_grole_title внутри одного flush и вернули 409 на полностью валидном наборе.
    """
    rows = rows if isinstance(rows, list) else []
    rows = rows[:GATHERING_ROLE_MAX]

    # 1. Нормализация входа + проверка дубликатов по КОНЕЧНОМУ набору (до похода в БД).
    parsed, seen = [], set()
    for i, raw in enumerate(rows):
        if not isinstance(raw, dict):
            continue
        title_ru = clean_title(raw.get('titleRu') or raw.get('title'))
        if title_ru is None:
            continue                                    # безымянная строка — просто пропускаем
        key = title_ru.lower()
        if key in seen:
            return False, {'error': f'Роль «{title_ru}» указана дважды',
                           'errorKz': f'«{title_ru}» рөлі екі рет көрсетілген'}, 400
        seen.add(key)
        parsed.append({
            'id': raw.get('id'),
            'title_ru': title_ru,
            'title_kz': clean_title(raw.get('titleKz')) or title_ru,
            'capacity': clamp_capacity(raw.get('capacity', 1)),
            'newbie': bool(raw.get('newbie')),
            'preset': (str(raw.get('preset') or '').strip()[:24]) or None,
            'sort': i,                                  # порядок = позиция во входном массиве
        })

    existing = {r.id: r for r in gathering.roles}
    keep_ids = set()
    for row in parsed:
        try:
            rid = int(row['id']) if row['id'] not in (None, '') else None
        except (ValueError, TypeError):
            rid = None
        row['id'] = rid if rid in existing else None
        if row['id'] is not None:
            keep_ids.add(row['id'])

    # 2. Удаление. Занятые роли — только с явным подтверждением: молча выкинуть людей
    #    из роли значит потерять волонтёра из-за чужой правки.
    counts = role_counts(gathering)
    doomed = [r for rid, r in existing.items() if rid not in keep_ids]
    busy = [r for r in doomed if counts.get(r.id, 0) > 0]
    if busy and not force:
        return False, {
            'error': 'На эти роли уже записались — подтвердите удаление',
            'errorKz': 'Бұл рөлдерге жазылып қойған — жоюды растаңыз',
            'conflicts': [{'roleId': r.id, 'titleRu': r.title_ru, 'titleKz': r.title_kz,
                           'taken': counts.get(r.id, 0)} for r in busy],
        }, 409

    # 3. Уменьшать вместимость ниже занятого нельзя вовсе — это единственный сценарий, где
    #    данные теряются необратимо и невидимо. Переполнение допускается только в обратную
    #    сторону: когда координатор В ПОЛЕ ставит человека сверх нормы (см. роут participants).
    for row in parsed:
        if row['id'] is None:
            continue
        taken = counts.get(row['id'], 0)
        if row['capacity'] and row['capacity'] < taken:
            title = existing[row['id']].title_ru
            return False, {'error': f'В роли «{title}» уже {taken} чел. — вместимость меньше не поставить',
                           'errorKz': f'«{title}» рөлінде {taken} адам бар — сыйымдылықты азайту мүмкін емес'}, 409

    freed = drop_role_links(gathering, {r.id for r in doomed})
    for r in doomed:
        gathering.roles.remove(r)
    db.session.flush()          # освобождаем названия ДО переименований и вставок

    # 4. Переименования — В ДВА ПРОХОДА, через временные имена. Одним проходом обмен
    #    названиями («Фотограф» ↔ «Общая помощь») упирается в uq_grole_title на первом же
    #    UPDATE: вторая роль ещё носит старое имя. Временное имя гарантированно свободно
    #    (id уникален), поэтому промежуточное состояние констрейнт не нарушает.
    renamed = [row for row in parsed
               if row['id'] is not None and existing[row['id']].title_ru != row['title_ru']]
    if len(renamed) > 1:
        for row in renamed:
            existing[row['id']].title_ru = f'__tmp_{existing[row["id"]].id}'
        db.session.flush()

    for row in parsed:
        if row['id'] is None:
            continue
        r = existing[row['id']]
        r.title_ru, r.title_kz = row['title_ru'], row['title_kz']
        r.capacity, r.newbie, r.sort = row['capacity'], row['newbie'], row['sort']
        if row['preset'] is not None:
            r.preset = row['preset']
    db.session.flush()

    # 5. Новые.
    for row in parsed:
        if row['id'] is not None:
            continue
        db.session.add(GatheringRole(
            gathering_id=gathering.id, title_ru=row['title_ru'], title_kz=row['title_kz'],
            capacity=row['capacity'], newbie=row['newbie'], preset=row['preset'], sort=row['sort'],
        ))

    return True, {'freed': freed}, None


def create_roles(gathering, rows):
    """Роли при создании сбора — в той же транзакции, что и сам сбор (вторым запросом
    нельзя: он может не дойти, и координатор уедет с экрана со сбором без ролей).
    Кривые строки отбрасываем молча, как skills в заявке: создание сбора важнее."""
    rows = rows if isinstance(rows, list) else []
    seen = set()
    sort = 0
    for raw in rows:
        if sort >= GATHERING_ROLE_MAX:
            break
        if not isinstance(raw, dict):
            continue
        title_ru = clean_title(raw.get('titleRu') or raw.get('title'))
        if title_ru is None or title_ru.lower() in seen:
            continue
        seen.add(title_ru.lower())
        db.session.add(GatheringRole(
            gathering_id=gathering.id, title_ru=title_ru,
            title_kz=clean_title(raw.get('titleKz')) or title_ru,
            capacity=clamp_capacity(raw.get('capacity', 1)),
            newbie=bool(raw.get('newbie')),
            preset=(str(raw.get('preset') or '').strip()[:24]) or None,
            sort=sort,
        ))
        sort += 1


def sync_participant_role(gathering, participant, data, key='roleId'):
    """Общая ветка для обоих RSVP-роутов. → (ok, err_ru, err_kz, status).

    Ключа нет в теле → роль НЕ трогаем (дозаполняем, не затираем — идиома guest.put_rsvp).
    Ответ 'no' освобождает место всегда, даже если roleId прислали.
    """
    if participant.answer == 'no':
        release_role(participant)
        return True, None, None, None
    if key not in data:
        return True, None, None, None
    return pick_role(gathering, participant, data.get(key))
