"""Сериализация под формы фронта.

Ключевой инвариант: публичный вид сбора (/g/:code) НИКОГДА не отдаёт прогноз,
ростер и телефоны — только координатору (owner-вид).

Форма ответа повторяет фронтовые сущности (titleRu/titleKz, participants[].history)
чтобы фронт подключался с минимальными правками.
"""

# Локализованные названия для формата дат «суббота, 18 июля» / «сенбі, 18 шілде».
_WD_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
_WD_KZ = ['дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі', 'жексенбі']
_MON_RU = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
           'августа', 'сентября', 'октября', 'ноября', 'декабря']
_MON_KZ = ['', 'қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде',
           'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан']


def _iso(dt):
    if dt is None:
        return None
    s = dt.isoformat()
    return s.replace('+00:00', 'Z') if s.endswith('+00:00') else s


def date_labels(dt):
    """→ (dateRu, dateKz, time) как на фронте, из starts_at."""
    if dt is None:
        return None, None, None
    wd = dt.weekday()
    date_ru = f'{_WD_RU[wd]}, {dt.day} {_MON_RU[dt.month]}'
    date_kz = f'{_WD_KZ[wd]}, {dt.day} {_MON_KZ[dt.month]}'
    return date_ru, date_kz, dt.strftime('%H:%M')


def _base_gathering(g):
    date_ru, date_kz, time = date_labels(g.starts_at)
    return {
        'id': g.id,
        'code': g.code,
        'titleRu': g.title_ru,
        'titleKz': g.title_kz,
        'placeRu': g.place_ru,
        'placeKz': g.place_kz,
        'startsAt': _iso(g.starts_at),
        'dateRu': date_ru,
        'dateKz': date_kz,
        'time': time,
        'needed': g.needed,
        'status': g.status,
        'theme': g.theme,
        'cityId': g.city_id,
        'format': g.format,
    }


def serialize_participant(p, coordinator=False):
    """coordinator=True раскрывает телефон и историю (PII)."""
    d = {
        'id': p.id,
        'name': p.name,
        'answer': p.answer,
        'presence': p.presence,
        'isGuest': p.is_guest,
    }
    if coordinator:
        d['phone'] = p.phone
        d['history'] = p.history
    return d


def serialize_gathering_owner(g):
    """Полный вид для координатора: ростер + ctx + counts (без прогноза — он отдельным
    эндпоинтом, но counts безопасны и нужны для полосы/фильтров)."""
    from services.forecast import compute_forecast
    d = _base_gathering(g)
    d['ctx'] = g.ctx
    d['revision'] = g.revision
    d['ownerId'] = g.owner_id
    d['participants'] = [serialize_participant(p, coordinator=True) for p in g.participants]
    d['counts'] = compute_forecast(g.participants, g.ctx or 1.0)['counts']
    return d


def serialize_gathering_public(g, my_answer=None):
    """Публичный вид (/g/:code): БЕЗ прогноза, ростера и телефонов.
    Только агрегат «сейчас придут N» (= число ответивших 'yes')."""
    d = _base_gathering(g)
    coming = sum(1 for p in g.participants if p.answer == 'yes')
    d['comingCount'] = coming
    d['myAnswer'] = my_answer
    return d


def serialize_gathering_card(g):
    """Карточка для /me/gatherings. Агрегаты, без PII."""
    d = _base_gathering(g)
    came = sum(1 for p in g.participants if p.presence == 'came')
    answered = sum(1 for p in g.participants if p.answer in ('yes', 'maybe', 'no'))
    going = sum(1 for p in g.participants if p.answer == 'yes')
    d['answered'] = answered
    d['going'] = going
    d['came'] = came
    return d


# ── P2a: соц-платформа ──

def _going(g):
    # going = базовый кэш (демо-события без реального ростера) + реальные «да».
    # У сборов с настоящим ростером going_cache=None, поэтому считается по ростеру;
    # RSVP на кэш-событие прибавляется к кэшу (виден в счётчике).
    real = sum(1 for p in g.participants if p.answer == 'yes')
    return (g.going_cache or 0) + real


def serialize_event_card(g, viewer_id=None):
    """Карточка события ленты (форма фронтовой EVENTS)."""
    d = _base_gathering(g)
    d['orgId'] = g.org_id
    d['going'] = _going(g)
    d['mine'] = viewer_id is not None and g.owner_id == viewer_id
    return d


def serialize_org(org, following=None):
    from models import db, City, Gathering, Participant
    events_count = db.session.query(db.func.count(Gathering.id)).filter(
        Gathering.org_id == org.id, Gathering.status != 'deleted').scalar() or 0
    vol_count = db.session.query(db.func.count(db.distinct(Participant.user_id))).join(
        Gathering, Gathering.id == Participant.gathering_id).filter(
        Gathering.org_id == org.id, Participant.user_id.isnot(None)).scalar() or 0
    city = db.session.get(City, org.city_id) if org.city_id else None
    d = {
        'id': org.id, 'name': org.name, 'cat': org.cat, 'cityId': org.city_id,
        'city': city.name_ru if city else None, 'verified': org.verified,
        'aboutRu': org.about_ru, 'aboutKz': org.about_kz,
        'events': events_count, 'vol': vol_count,
    }
    if following is not None:
        d['following'] = following
    return d


def serialize_charity(c):
    return {
        'id': c.id, 'titleRu': c.title_ru, 'titleKz': c.title_kz, 'org': c.org_id,
        'cityId': c.city_id, 'kind': c.kind, 'goal': c.goal, 'raised': c.raised, 'unit': c.unit,
    }


def serialize_volunteer(u):
    from models import db, City
    city = db.session.get(City, u.city_id) if u.city_id else None
    return {
        'id': u.id, 'name': u.full_name, 'city': city.name_ru if city else None,
        'hours': u.hours_total or 0, 'events': u.events_attended or 0, 'rel': u.reliability or 0,
    }


def serialize_user_public(u):
    from models import db, City, BadgeAward, AttendanceRecord, Gathering
    city = db.session.get(City, u.city_id) if u.city_id else None
    badges = [b.badge_id for b in BadgeAward.query.filter_by(user_id=u.id).all()]
    # история участия из журнала явки (последние 10)
    recs = (AttendanceRecord.query.filter_by(user_id=u.id)
            .order_by(AttendanceRecord.created_at.desc()).limit(10).all())
    history = []
    for r in recs:
        gath = db.session.get(Gathering, r.gathering_id)
        dru, _dkz, _t = date_labels(gath.starts_at) if (gath and gath.starts_at) else (None, None, None)
        history.append({'t': gath.title_ru if gath else '—', 'd': dru or '', 'came': r.presence == 'came'})
    return {
        'id': u.id, 'name': u.full_name, 'city': city.name_ru if city else None,
        'cityId': u.city_id,
        'hours': u.hours_total or 0, 'events': u.events_attended or 0,
        'reliability': u.reliability or 0, 'rank': u.rank, 'skills': u.skills or [],
        'badges': badges, 'history': history,
    }


def serialize_conversation(convo, viewer_id):
    from models import db, User
    other = None
    for m in convo.members:
        if m.user_id != viewer_id:
            other = db.session.get(User, m.user_id)
            break
    name = other.full_name if (other and other.full_name) else convo.title
    role_label = 'НКО' if convo.role == 'nko' else 'Координатор'
    msgs = [{'me': msg.sender_id == viewer_id, 'txt': msg.body, 'created_at': _iso(msg.created_at)}
            for msg in convo.messages]
    return {'id': convo.id, 'name': name, 'role': role_label, 'msgs': msgs}


def serialize_city_stats(c):
    from models import db, Gathering, User
    active = db.session.query(db.func.count(Gathering.id)).filter(
        Gathering.city_id == c.id, Gathering.status == 'open').scalar() or 0
    vol = db.session.query(db.func.count(User.id)).filter(User.city_id == c.id).scalar() or 0
    return {'id': c.id, 'ru': c.name_ru, 'kz': c.name_kz, 'x': c.map_x, 'y': c.map_y,
            'active': active, 'vol': vol}


# ── P3: организатор (Manage HQ) и заявки ──

def _ago_labels(dt):
    """Относительное время → ('15 мин назад', '15 мин бұрын') из created_at."""
    from datetime import datetime, timezone
    if dt is None:
        return 'только что', 'жаңа ғана'
    if dt.tzinfo is None:            # SQLite отдаёт naive UTC
        dt = dt.replace(tzinfo=timezone.utc)
    diff = (datetime.now(timezone.utc) - dt).total_seconds()
    if diff < 60:
        return 'только что', 'жаңа ғана'
    if diff < 3600:
        m = int(diff // 60)
        return f'{m} мин назад', f'{m} мин бұрын'
    if diff < 86400:
        h = int(diff // 3600)
        return f'{h} ч назад', f'{h} сағ бұрын'
    d = int(diff // 86400)
    if d == 1:
        return 'вчера', 'кеше'
    return f'{d} дн назад', f'{d} күн бұрын'


def _org_event_status(g, today):
    """live (сегодня) | soon (в будущем) | done (прошёл/завершён). Статус — на СЕРВЕРЕ."""
    if g.status == 'done' or g.finalized_at is not None:
        return 'done'
    if g.starts_at is None:
        return 'soon'
    d = g.starts_at.date()
    if d < today:
        return 'done'
    if d == today:
        return 'live'
    return 'soon'


def serialize_org_event(g, applied=0, today=None):
    """Сбор в штабе организатора (форма buildOrgEvents). Даты/статус/счётчики — сервер."""
    from datetime import datetime, timezone
    if today is None:
        today = datetime.now(timezone.utc).date()
    date_ru, date_kz, time = date_labels(g.starts_at)
    yes = sum(1 for p in g.participants if p.answer == 'yes')
    maybe = sum(1 for p in g.participants if p.answer == 'maybe')
    no = sum(1 for p in g.participants if p.answer == 'no')
    came = sum(1 for p in g.participants if p.presence == 'came')
    return {
        'id': g.id, 'code': g.code,
        'titleRu': g.title_ru, 'titleKz': g.title_kz,
        'theme': g.theme,
        'placeRu': g.place_ru, 'placeKz': g.place_kz,
        'cityId': g.city_id,
        'dateRu': date_ru, 'dateKz': date_kz, 'time': time,
        'dateISO': g.starts_at.strftime('%Y-%m-%d') if g.starts_at else None,
        'status': _org_event_status(g, today),
        'needed': g.needed,
        'yes': yes, 'maybe': maybe, 'no': no,
        'applied': applied, 'answered': yes + maybe + no, 'came': came,
    }


def serialize_application(app):
    """Заявка волонтёра для организатора (карточка ManageRequests + applicant-шит).
    reliability/history — живые из User; PII (phone) — организатору можно."""
    from models import db, City, User
    ago_ru, ago_kz = _ago_labels(app.created_at)
    user = app.applicant if app.applicant is not None else (
        db.session.get(User, app.applicant_id) if app.applicant_id else None)
    city = db.session.get(City, app.city_id) if app.city_id else None
    history = {'came': (user.trust_came or 0) if user else 0,
               'total': (user.trust_total or 0) if user else 0}
    return {
        'id': app.id,
        'eventId': app.gathering_id,
        'name': app.name,
        'phone': app.phone,
        'city': city.name_ru if city else None,
        'skills': app.skills or [],
        'messageRu': app.message or '',
        'messageKz': app.message or '',
        'reliability': user.reliability if user else None,
        'history': history,
        'status': app.status,
        'agoRu': ago_ru, 'agoKz': ago_kz,
    }


def serialize_org_volunteer(u, last_g=None):
    """Волонтёр из базы организатора (форма buildOrgVolunteers) — агрегаты из User."""
    from models import db, City
    city = db.session.get(City, u.city_id) if u.city_id else None
    return {
        'id': u.id, 'name': u.full_name, 'city': city.name_ru if city else None,
        'hours': u.hours_total or 0, 'events': u.events_attended or 0,
        'reliability': u.reliability or 0, 'skills': u.skills or [],
        'lastRu': last_g.title_ru if last_g else None,
        'lastKz': last_g.title_kz if last_g else None,
    }
