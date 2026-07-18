from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone

db = SQLAlchemy()


def _now():
    return datetime.now(timezone.utc)


def _utc_iso(dt):
    """Convert datetime to ISO string with Z suffix for UTC."""
    if dt is None:
        return None
    s = dt.isoformat()
    if not s.endswith('Z') and '+' not in s:
        s += 'Z'
    return s


# Разрешённые значения строковых «enum»-полей (валидируем в коде, не в БД —
# так проще с миграциями на SQLite).
ANSWERS = ('yes', 'maybe', 'no')
PRESENCES = ('came', 'missed')
GATHERING_STATUSES = ('open', 'done', 'deleted')
GATHERING_FORMATS = ('one', 'reg')
USER_ROLES = ('vol', 'coord', 'org')
NOTIF_TYPES = ('answer', 'reminder', 'badge', 'event', 'system')
REMIND_AUDIENCES = ('maybe', 'all')


# ─────────────────────────────────────────────────────────────────────────────
#  Личность (identity): User — универсальный актор.
#  device-участник = User с device_id и full_name, без email/пароля.
#  полный аккаунт (НКО/админ) = тот же User + email + password_hash.
# ─────────────────────────────────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)

    # Аккаунт (все nullable — device-пользователь их не имеет)
    email = db.Column(db.String(120), unique=True, nullable=True, index=True)
    nickname = db.Column(db.String(50), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(255), nullable=True)

    full_name = db.Column(db.String(100))          # отображаемое имя / имя участника
    user_type = db.Column(db.String(20), default='user')   # user | admin (привилегия)
    is_active = db.Column(db.Boolean, default=True)
    is_verified = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime, default=_now)
    last_login = db.Column(db.DateTime)

    # Токены восстановления/верификации
    reset_token = db.Column(db.String(100), unique=True)
    reset_token_expires = db.Column(db.DateTime)
    verification_token = db.Column(db.String(100), unique=True)

    # ── erik: device-личность и продуктовые поля ──
    device_id = db.Column(db.String(64), unique=True, nullable=True, index=True)
    phone = db.Column(db.String(32), nullable=True, index=True)
    role = db.Column(db.String(8), default='vol')          # vol | coord | org
    city_id = db.Column(db.String(3), db.ForeignKey('cities.id'), nullable=True)
    lang = db.Column(db.String(2), default='ru')
    skills = db.Column(db.JSON, nullable=True)             # ['Организация', ...]
    user_agent = db.Column(db.String(255), nullable=True)
    last_seen_at = db.Column(db.DateTime)

    # ── Агрегаты явки (только сервер пишет, при финализации сбора) ──
    hours_total = db.Column(db.Integer, default=0)
    events_attended = db.Column(db.Integer, default=0)
    trust_came = db.Column(db.Integer, default=0)   # Σ пришёл по завершённым сборам
    trust_total = db.Column(db.Integer, default=0)  # Σ записался по завершённым сборам
    reliability = db.Column(db.Integer, default=0)  # round(100*came/total)
    rank = db.Column(db.Integer, nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    @property
    def has_account(self):
        return bool(self.password_hash)

    @property
    def has_profile(self):
        """Заполнена ли личность (имя) — минимум для «authed-user»-действий."""
        return bool((self.full_name or '').strip())

    def to_dict(self, include_sensitive=False):
        data = {
            'id': self.id,
            'email': self.email,
            'nickname': self.nickname,
            'full_name': self.full_name,
            'user_type': self.user_type,
            'role': self.role,
            'phone': self.phone,
            'city_id': self.city_id,
            'lang': self.lang,
            'skills': self.skills or [],
            'hours_total': self.hours_total or 0,
            'events_attended': self.events_attended or 0,
            'reliability': self.reliability or 0,
            'rank': self.rank,
            'has_account': self.has_account,
            'created_at': _utc_iso(self.created_at),
            'last_login': _utc_iso(self.last_login),
        }
        if include_sensitive:
            data['is_active'] = self.is_active
            data['is_verified'] = self.is_verified
            data['device_id'] = self.device_id
        return data


# ─────────────────────────────────────────────────────────────────────────────
#  Каталоги (минимум для P0; полные соц-модели — в P2)
# ─────────────────────────────────────────────────────────────────────────────
class Theme(db.Model):
    __tablename__ = 'themes'
    id = db.Column(db.String(16), primary_key=True)   # eco | elderly | ...
    label_ru = db.Column(db.String(60))
    label_kz = db.Column(db.String(60))
    tint = db.Column(db.String(9))
    ink = db.Column(db.String(9))

    def to_dict(self):
        return {'id': self.id, 'ru': self.label_ru, 'kz': self.label_kz,
                'tint': self.tint, 'ink': self.ink}


class City(db.Model):
    __tablename__ = 'cities'
    id = db.Column(db.String(3), primary_key=True)    # ast | alm | ...
    name_ru = db.Column(db.String(60))
    name_kz = db.Column(db.String(60))
    map_x = db.Column(db.Float)
    map_y = db.Column(db.Float)

    def to_dict(self, active=None, vol=None):
        d = {'id': self.id, 'ru': self.name_ru, 'kz': self.name_kz,
             'x': self.map_x, 'y': self.map_y}
        if active is not None:
            d['active'] = active
        if vol is not None:
            d['vol'] = vol
        return d


# ─────────────────────────────────────────────────────────────────────────────
#  Ядро: Сбор + Явка
# ─────────────────────────────────────────────────────────────────────────────
class Gathering(db.Model):
    __tablename__ = 'gatherings'
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(12), unique=True, index=True, nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True, nullable=False)
    org_id = db.Column(db.Integer, db.ForeignKey('orgs.id'), nullable=True)
    city_id = db.Column(db.String(3), db.ForeignKey('cities.id'), nullable=True)
    theme = db.Column(db.String(16), db.ForeignKey('themes.id'), nullable=True)

    title_ru = db.Column(db.String(200))
    title_kz = db.Column(db.String(200))
    place_ru = db.Column(db.String(200))
    place_kz = db.Column(db.String(200))
    starts_at = db.Column(db.DateTime(timezone=True))
    format = db.Column(db.String(4), default='one')       # one | reg
    needed = db.Column(db.Integer, default=20)
    status = db.Column(db.String(8), default='open')      # open | done | deleted
    ctx = db.Column(db.Float, default=1.0)
    revision = db.Column(db.Integer, default=0)           # для delta-поллинга
    going_cache = db.Column(db.Integer, nullable=True)    # демо-события ленты без реального ростера

    created_at = db.Column(db.DateTime, default=_now)
    finalized_at = db.Column(db.DateTime)

    owner = db.relationship('User', foreign_keys=[owner_id])
    participants = db.relationship('Participant', back_populates='gathering',
                                   cascade='all, delete-orphan', lazy='selectin')
    coordinators = db.relationship('GatheringCoordinator', back_populates='gathering',
                                   cascade='all, delete-orphan')

    def bump(self):
        self.revision = (self.revision or 0) + 1


class GatheringCoordinator(db.Model):
    __tablename__ = 'gathering_coordinators'
    id = db.Column(db.Integer, primary_key=True)
    gathering_id = db.Column(db.Integer, db.ForeignKey('gatherings.id', ondelete='CASCADE'), index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    role = db.Column(db.String(8), default='owner')       # owner | cocoord
    gathering = db.relationship('Gathering', back_populates='coordinators')
    __table_args__ = (db.UniqueConstraint('gathering_id', 'user_id', name='uq_gcoord'),)


class Participant(db.Model):
    __tablename__ = 'participants'
    id = db.Column(db.Integer, primary_key=True)
    gathering_id = db.Column(db.Integer, db.ForeignKey('gatherings.id', ondelete='CASCADE'),
                             index=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)

    name = db.Column(db.String(100))
    phone = db.Column(db.String(32), nullable=True)       # PII — только координатору
    answer = db.Column(db.String(5), nullable=True)       # yes | maybe | no
    presence = db.Column(db.String(6), nullable=True)     # came | missed
    is_guest = db.Column(db.Boolean, default=False)
    client_mark_id = db.Column(db.String(64), nullable=True, index=True)  # идемпотентность офлайн-синка

    # snapshot истории на момент RSVP (для воспроизводимости и гостей без user)
    hist_total_at_rsvp = db.Column(db.Integer, default=0)
    hist_came_at_rsvp = db.Column(db.Integer, default=0)

    answered_at = db.Column(db.DateTime)
    checked_in_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)

    gathering = db.relationship('Gathering', back_populates='participants')
    user = db.relationship('User', foreign_keys=[user_id])

    __table_args__ = (
        db.UniqueConstraint('gathering_id', 'user_id', name='uq_participant_user'),
        db.Index('ix_participant_poll', 'gathering_id', 'updated_at'),
    )

    @property
    def history(self):
        """{total, came} — живое из User.trust_* если привязан, иначе snapshot."""
        if self.user_id and self.user is not None:
            return {'total': self.user.trust_total or 0, 'came': self.user.trust_came or 0}
        return {'total': self.hist_total_at_rsvp or 0, 'came': self.hist_came_at_rsvp or 0}


class AttendanceRecord(db.Model):
    """Неизменяемый журнал явки — источник истины для обучения trust."""
    __tablename__ = 'attendance_records'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True, nullable=True)
    gathering_id = db.Column(db.Integer, db.ForeignKey('gatherings.id'), index=True)
    answer = db.Column(db.String(5))
    presence = db.Column(db.String(6))                    # came | missed
    hours_credited = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.UniqueConstraint('user_id', 'gathering_id', name='uq_attendance'),)


class ForecastParams(db.Model):
    """Синглтон-конфиг модели прогноза (id=1). Чтобы BASE/ALPHA можно было
    пере-оценивать на реальных данных, а не хардкодить."""
    __tablename__ = 'forecast_params'
    id = db.Column(db.Integer, primary_key=True)
    alpha = db.Column(db.Float, default=3.0)
    base_yes = db.Column(db.Float, default=0.62)
    base_maybe = db.Column(db.Float, default=0.24)
    base_no = db.Column(db.Float, default=0.02)
    p_min = db.Column(db.Float, default=0.02)
    p_max = db.Column(db.Float, default=0.98)
    sigma_k = db.Column(db.Float, default=2.0)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)

    @classmethod
    def get(cls):
        row = db.session.get(cls, 1)
        if row is None:
            row = cls(id=1)
            db.session.add(row)
            db.session.commit()
        return row

    def base(self, answer):
        return {'yes': self.base_yes, 'maybe': self.base_maybe, 'no': self.base_no}.get(answer, self.base_no)


# ─────────────────────────────────────────────────────────────────────────────
#  P1: Уведомления, напоминания, бейджи
# ─────────────────────────────────────────────────────────────────────────────
class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True, nullable=False)
    type = db.Column(db.String(10))                       # answer|reminder|badge|event|system
    text_ru = db.Column(db.String(300))
    text_kz = db.Column(db.String(300))
    read = db.Column(db.Boolean, default=False)
    read_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.Index('ix_notif_user_read', 'user_id', 'read', 'created_at'),)

    def to_dict(self):
        return {
            'id': self.id, 'type': self.type,
            'ru': self.text_ru, 'kz': self.text_kz,
            'read': self.read, 'created_at': _utc_iso(self.created_at),
        }


class Reminder(db.Model):
    __tablename__ = 'reminders'
    id = db.Column(db.Integer, primary_key=True)
    gathering_id = db.Column(db.Integer, db.ForeignKey('gatherings.id', ondelete='CASCADE'), index=True)
    sent_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    audience = db.Column(db.String(5), default='maybe')   # maybe | all
    text_ru = db.Column(db.String(300))
    text_kz = db.Column(db.String(300))
    recipient_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=_now)


class Badge(db.Model):
    __tablename__ = 'badges'
    id = db.Column(db.String(16), primary_key=True)       # first|ten|reliable|eco|night|lead
    label_ru = db.Column(db.String(60))
    label_kz = db.Column(db.String(60))
    glyph = db.Column(db.String(8))

    def to_dict(self):
        return {'id': self.id, 'ru': self.label_ru, 'kz': self.label_kz, 'glyph': self.glyph}


class BadgeAward(db.Model):
    __tablename__ = 'badge_awards'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    badge_id = db.Column(db.String(16), db.ForeignKey('badges.id'))
    awarded_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.UniqueConstraint('user_id', 'badge_id', name='uq_badge_award'),)


# ─────────────────────────────────────────────────────────────────────────────
#  P2a: Соц-платформа — НКО, помощь, подписки
# ─────────────────────────────────────────────────────────────────────────────
CHARITY_KINDS = ('money', 'items')


class Org(db.Model):
    __tablename__ = 'orgs'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200))
    cat = db.Column(db.String(16), db.ForeignKey('themes.id'))
    city_id = db.Column(db.String(3), db.ForeignKey('cities.id'), nullable=True)
    verified = db.Column(db.Boolean, default=False)
    about_ru = db.Column(db.Text)
    about_kz = db.Column(db.Text)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)


class CharityRequest(db.Model):
    __tablename__ = 'charity_requests'
    id = db.Column(db.Integer, primary_key=True)
    title_ru = db.Column(db.String(200))
    title_kz = db.Column(db.String(200))
    org_id = db.Column(db.Integer, db.ForeignKey('orgs.id'), nullable=True)
    city_id = db.Column(db.String(3), db.ForeignKey('cities.id'), nullable=True)
    kind = db.Column(db.String(6), default='money')       # money | items
    unit = db.Column(db.String(16))                       # ₸ | вещей | книг
    goal = db.Column(db.Integer, default=0)
    raised = db.Column(db.Integer, default=0)             # сервер-авторитетно
    created_at = db.Column(db.DateTime, default=_now)


class Donation(db.Model):
    __tablename__ = 'donations'
    id = db.Column(db.Integer, primary_key=True)
    charity_id = db.Column(db.Integer, db.ForeignKey('charity_requests.id'), index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    amount = db.Column(db.Integer, default=0)             # ₸ для money, количество для items
    created_at = db.Column(db.DateTime, default=_now)


class Follow(db.Model):
    __tablename__ = 'follows'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    org_id = db.Column(db.Integer, db.ForeignKey('orgs.id'), index=True)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.UniqueConstraint('user_id', 'org_id', name='uq_follow'),)
