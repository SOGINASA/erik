"""Отправка email. Реальный SMTP при заданном MAIL_SERVER; иначе — dev-лог.

В dev/демо (без SMTP) письмо не уходит, но факт и содержимое пишутся в лог, а
вызывающий код (forgot-password) в НЕ-проде возвращает токен в ответе, чтобы флоу
восстановления/верификации был проходим end-to-end без почтового сервера.
"""
import smtplib
from email.message import EmailMessage

from flask import current_app


def is_configured():
    return bool(current_app.config.get('MAIL_SERVER'))


def send_email(to, subject, body):
    """Вернёт True, если письмо реально отправлено по SMTP; False в dev-режиме (залогировано)."""
    if not is_configured():
        current_app.logger.info('EMAIL (dev, не отправлено) → %s | %s\n%s', to, subject, body)
        return False
    msg = EmailMessage()
    msg['From'] = current_app.config.get('MAIL_FROM', 'no-reply@erik.kz')
    msg['To'] = to
    msg['Subject'] = subject
    msg.set_content(body)
    port = int(current_app.config.get('MAIL_PORT', 587))
    with smtplib.SMTP(current_app.config['MAIL_SERVER'], port, timeout=10) as s:
        if current_app.config.get('MAIL_USE_TLS', True):
            s.starttls()
        user = current_app.config.get('MAIL_USERNAME')
        if user:
            s.login(user, current_app.config.get('MAIL_PASSWORD') or '')
        s.send_message(msg)
    return True
