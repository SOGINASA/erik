from routes.auth import auth_bp
from routes.admin import admin_bp
from routes.session import session_bp
from routes.gatherings import gatherings_bp
from routes.guest import guest_bp


__all__ = [
    'auth_bp',
    'admin_bp',
    'session_bp',
    'gatherings_bp',
    'guest_bp',
]
