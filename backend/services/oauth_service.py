"""Google OpenID Connect, adapted to Erik's existing JWT authentication."""
from urllib.parse import urlsplit

from authlib.integrations.flask_client import OAuth
from flask import current_app


def google_enabled():
    return all(current_app.config.get(key) for key in (
        'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'))


def init_oauth(app):
    oauth = OAuth(app)
    app.extensions['erik_oauth'] = oauth
    oauth.register('google',
        client_id=app.config.get('GOOGLE_CLIENT_ID'),
        client_secret=app.config.get('GOOGLE_CLIENT_SECRET'),
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile', 'code_challenge_method': 'S256', 'timeout': 10})
    if all(app.config.get(key) for key in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI')):
        for key in ('GOOGLE_REDIRECT_URI', 'FRONTEND_URL'):
            url = urlsplit(app.config.get(key, ''))
            local_http = url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1')
            if (not url.netloc or url.username or url.password or url.query or url.fragment
                    or (url.scheme != 'https' and not (local_http and not app.config.get('SESSION_COOKIE_SECURE')))):
                raise RuntimeError(f'{key} must be an absolute HTTPS URL (HTTP only for local development)')


def google_client():
    return current_app.extensions['erik_oauth'].create_client('google')
