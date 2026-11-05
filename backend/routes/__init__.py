from routes.auth import auth_bp
from routes.admin import admin_bp
from routes.session import session_bp
from routes.gatherings import gatherings_bp
from routes.guest import guest_bp
from routes.notifications import notifications_bp
from routes.platform import platform_bp
from routes.organizer import organizer_bp
from routes.universities import universities_bp
from routes import university_microsoft  # registers callbacks on universities_bp
from services import application_data  # transactional evidence for every application path
from routes.review_data import review_data_bp


__all__ = [
    'auth_bp',
    'admin_bp',
    'session_bp',
    'gatherings_bp',
    'guest_bp',
    'notifications_bp',
    'platform_bp',
    'organizer_bp',
    'universities_bp',
    'review_data_bp',
]
