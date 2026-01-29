from .auth import auth_bp, register_auth_hooks
from .admin import admin_bp
from .pages import pages_bp
from .projects import projects_bp
from .media import media_bp
from .jobs import jobs_bp
from . import audio_ws  # noqa: F401


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(jobs_bp)
    register_auth_hooks(app)
