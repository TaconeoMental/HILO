from flask import jsonify, redirect, request
from flask_login import LoginManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sock import Sock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session

from config import Config

# DB
engine = create_engine(
    Config.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300
)
Session = scoped_session(sessionmaker(bind=engine))

# Login
login_manager = LoginManager()
sock = Sock()


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "500 per hour"],
    storage_uri=Config.REDIS_URL if Config.REDIS_URL else "memory://",
)

# Constantes RL
LIMITS = {
    "audio_chunk": "30 per minute",
    "photo": "20 per minute",
    "project_start": "10 per minute",
    "project_stop": "10 per minute",
}


def get_db():
    return Session()


def init_extensions(app):
    login_manager.init_app(app)
    limiter.init_app(app)
    sock.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "No autenticado"}), 401
        return redirect("/login")

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        Session.remove()
