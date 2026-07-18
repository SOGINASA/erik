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
    """Карточка для списков (/me/gatherings, лента). Агрегаты, без PII."""
    d = _base_gathering(g)
    came = sum(1 for p in g.participants if p.presence == 'came')
    answered = sum(1 for p in g.participants if p.answer in ('yes', 'maybe', 'no'))
    going = sum(1 for p in g.participants if p.answer == 'yes')
    d['answered'] = answered
    d['going'] = going
    d['came'] = came
    return d
