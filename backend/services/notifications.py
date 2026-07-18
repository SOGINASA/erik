"""P1: уведомления, напоминания сомневающимся, выдача бейджей.

Уведомления создаются действиями (remind → maybe-участникам; финализация → бейджи).
Бейджи выводятся из реальной явки (AttendanceRecord) — «точнее от использования».
"""
from datetime import datetime, timezone

from models import (
    db, User, Badge, BadgeAward, Notification, Reminder,
    AttendanceRecord, Gathering, Participant,
)


def create_notification(user_id, ntype, text_ru, text_kz):
    n = Notification(user_id=user_id, type=ntype, text_ru=text_ru, text_kz=text_kz)
    db.session.add(n)
    return n


def unread_count(user_id):
    return (db.session.query(db.func.count(Notification.id))
            .filter(Notification.user_id == user_id, Notification.read.is_(False))
            .scalar()) or 0


# ── бейджи ──

def _has_badge(user_id, badge_id):
    return db.session.query(BadgeAward.id).filter_by(user_id=user_id, badge_id=badge_id).first() is not None


def _earned_eco(user_id):
    return db.session.query(AttendanceRecord.id).join(
        Gathering, Gathering.id == AttendanceRecord.gathering_id
    ).filter(
        AttendanceRecord.user_id == user_id,
        AttendanceRecord.presence == 'came',
        Gathering.theme == 'eco',
    ).first() is not None


def _owns_gathering(user_id):
    return db.session.query(Gathering.id).filter(
        Gathering.owner_id == user_id, Gathering.status != 'deleted'
    ).first() is not None


def _badge_conditions(user):
    """id бейджа → выполнено ли условие (по реальным данным)."""
    return {
        'first': (user.events_attended or 0) >= 1,
        'ten': (user.events_attended or 0) >= 10,
        'reliable': (user.trust_total or 0) >= 3 and (user.reliability or 0) >= 90,
        'eco': _earned_eco(user.id),
        'lead': _owns_gathering(user.id),
    }


def award_badges(user):
    """Выдать заслуженные, но ещё не выданные бейджи. Создаёт badge-уведомления.
    Возвращает список новых badge_id."""
    newly = []
    for badge_id, ok in _badge_conditions(user).items():
        if not ok or _has_badge(user.id, badge_id):
            continue
        db.session.add(BadgeAward(user_id=user.id, badge_id=badge_id))
        badge = db.session.get(Badge, badge_id)
        ru = badge.label_ru if badge else badge_id
        kz = badge.label_kz if badge else badge_id
        create_notification(user.id, 'badge',
                            f'Вы получили бейдж «{ru}»', f'«{kz}» бейджін алдыңыз')
        newly.append(badge_id)
    return newly


# ── напоминания ──

def notify_reminder(gathering, audience, text_ru, text_kz, sent_by_id):
    """Создать напоминание и разослать уведомления адресатам. Возвращает recipient_count."""
    wanted = ('maybe',) if audience == 'maybe' else ('yes', 'maybe')
    recipients = [p for p in gathering.participants
                  if p.answer in wanted and p.user_id]

    title_ru = gathering.title_ru or 'сбор'
    title_kz = gathering.title_kz or 'жиын'
    dru = text_ru or f'Напоминание о сборе «{title_ru}»'
    dkz = text_kz or f'«{title_kz}» жиыны туралы еске салу'

    for p in recipients:
        create_notification(p.user_id, 'reminder', dru, dkz)

    reminder = Reminder(
        gathering_id=gathering.id, sent_by_id=sent_by_id, audience=audience,
        text_ru=dru, text_kz=dkz, recipient_count=len(recipients),
    )
    db.session.add(reminder)
    db.session.commit()
    return len(recipients)
