"""Сбор ПОЛНОЙ истории волонтёра для ML-модели прогноза явки.

Зачем отдельный модуль: раньше мост `attendance_ml` передавал в модель только три
поля (`came`, `total`, `interests`), а остальные десять признаков уходили в дефолты
`features.features_from_history`. Модель, обученная на 14 признаках, в проде
работала фактически на связке (came, total, answer) — то есть вырождалась ровно в
те же входы, что и аналитическая формула. Это и есть «похоже на формулу, не на
модель»: второй по важности признак `interest_match` (permutation-важность 0.052)
был тождественно нулём, потому что `User.skills` — это навыки («Организация»,
«Водитель»), а не темы сборов.

Здесь история собирается из журнала `AttendanceRecord` — того же неизменяемого
источника истины, на котором обучается `trust`. Правило одно и то же, что и в
`ml/features.build_training_frame`: признаки для сбора считаются ТОЛЬКО по сборам,
которые прошли РАНЬШЕ него (причинно, без заглядывания в будущее). Иначе прогноз
подглядывал бы в собственный ответ, а бэктест точности показывал бы фальшиво
хорошие цифры.

Один запрос на весь ростер (никаких N+1): роутер `/poll` дёргается раз в 10 секунд
на каждого координатора, и 45 отдельных SELECT там недопустимы.
"""
from datetime import timedelta

# Окно «свежей динамики» — держим в согласии с ml/config.RECENT_WINDOW.
RECENT_WINDOW = 5

# Априорная явка для новичка без истории — как PRIOR_ATTENDANCE в ml/config.
PRIOR_ATTENDANCE = 0.5

# Сколько дней ставить, если прошлых сборов нет вовсе (как в build_training_frame).
DEFAULT_DAYS_SINCE_LAST = 30.0


def _prior_rows(gathering):
    """Журнал явки всех участников сбора по сборам, прошедшим РАНЬШЕ этого.

    → {user_id: [(starts_at, theme, presence), ...]} отсортировано по времени.
    Возвращает пустой словарь, если у сбора нет привязанных к аккаунту участников.
    """
    from models import db, AttendanceRecord, Gathering

    user_ids = {p.user_id for p in gathering.participants if p.user_id}
    if not user_ids:
        return {}

    rows = (db.session.query(
                AttendanceRecord.user_id,
                AttendanceRecord.presence,
                Gathering.theme,
                Gathering.starts_at,
            )
            .join(Gathering, Gathering.id == AttendanceRecord.gathering_id)
            .filter(AttendanceRecord.user_id.in_(user_ids),
                    AttendanceRecord.gathering_id != gathering.id)
            .all())

    # Причинный отсев: только то, что случилось до текущего сбора. Сравнение дат
    # делаем в Python, а не в SQL, потому что starts_at бывает None (черновики), и
    # тогда запись просто не участвует в истории, а не роняет запрос.
    cutoff = gathering.starts_at
    by_user = {}
    for user_id, presence, theme, starts_at in rows:
        if starts_at is None:
            continue
        if cutoff is not None and starts_at >= cutoff:
            continue
        by_user.setdefault(user_id, []).append((starts_at, theme, presence))

    for items in by_user.values():
        items.sort(key=lambda r: r[0])
    return by_user


def _naive_dt(dt):
    """Привести к naive-UTC: в БД лежат naive-даты, а now() из routes — aware."""
    return dt.replace(tzinfo=None) if dt is not None and dt.tzinfo is not None else dt


def build_histories(gathering, at_rsvp=False):
    """История каждого участника в формате `ml.features.features_from_history`.

    at_rsvp=True — состояние «как на момент RSVP»: `came`/`total` берутся из
    снапшота `hist_*_at_rsvp`, а не из живого `User.trust_*`. Нужно для честного
    бэктеста: живой trust уже обучен ЭТИМ ЖЕ сбором, и прогноз по нему подглядывал
    бы в ответ (та же причина, по которой в organizer.py есть _AtRsvpPart).

    → {participant_id: history_dict}
    """
    prior = _prior_rows(gathering)
    theme = gathering.theme
    cutoff = _naive_dt(gathering.starts_at)

    out = {}
    for part in gathering.participants:
        rows = prior.get(part.user_id, []) if part.user_id else []

        # ── сколько всего сборов и на скольких был ──
        if at_rsvp or not rows:
            # Снапшот RSVP (или отсутствие журнала — свежая БД, демо-сид):
            # единственные агрегаты, которые есть, — Participant.history.
            snap = part.history if not at_rsvp else {
                'total': part.hist_total_at_rsvp or 0,
                'came': part.hist_came_at_rsvp or 0,
            }
            events_total = int(snap.get('total') or 0)
            events_came = int(snap.get('came') or 0)
        else:
            events_total = len(rows)
            events_came = sum(1 for _, _, presence in rows if presence == 'came')

        # ── история именно по теме этого сбора ──
        theme_rows = [r for r in rows if theme and r[1] == theme]
        theme_total = len(theme_rows)
        theme_came = sum(1 for _, _, presence in theme_rows if presence == 'came')

        # ── свежесть: последние RECENT_WINDOW исходов и дни с прошлого сбора ──
        if rows:
            recent = rows[-RECENT_WINDOW:]
            recent_came_rate = sum(1 for _, _, pr in recent if pr == 'came') / len(recent)
            last_at = rows[-1][0]
            if cutoff is not None and last_at is not None:
                days_since_last = max(0.0, (cutoff - _naive_dt(last_at)) / timedelta(days=1))
            else:
                days_since_last = DEFAULT_DAYS_SINCE_LAST
        else:
            # Новичок: та же априорная величина, что подставляет обучение.
            recent_came_rate = (events_came / events_total) if events_total else PRIOR_ATTENDANCE
            days_since_last = DEFAULT_DAYS_SINCE_LAST

        out[part.id] = {
            'came': events_came,
            'total': max(events_total, events_came),
            'theme_came': theme_came,
            'theme_total': theme_total,
            'recent_came_rate': recent_came_rate,
            'days_since_last': days_since_last,
            'interests': interests_of(part, rows),
        }
    return out


def interests_of(part, prior_rows=None):
    """Темы, которые волонтёру близки, — для признака `interest_match`.

    Приоритет источников:
      1. `User.interests` — темы, выбранные волонтёром явно (id из таблицы themes);
      2. темы, на сборы которых он РЕАЛЬНО приходил (поведение вместо анкеты);
      3. пусто — новичок без аккаунта или без истории.

    `User.skills` сюда НЕ попадает намеренно: там навыки («Организация», «Фото»),
    а модель ждёт id тем ('eco', 'edu', …). Подстановка навыков давала
    interest_match ≡ 0 и убивала второй по важности признак модели.
    """
    user = part.user if part.user_id else None
    if user is not None:
        chosen = getattr(user, 'interests', None)
        if chosen:
            return [str(t) for t in chosen if t]

    if prior_rows:
        return sorted({theme for _, theme, presence in prior_rows
                       if theme and presence == 'came'})
    return []
