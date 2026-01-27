from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, request, redirect, session
from flask_login import login_user, logout_user, login_required, current_user

from config import Config
from extensions import Session, limiter
from logger import get_logger
from models import User, UserSession, log_audit, utcnow

auth_bp = Blueprint("auth", __name__)
log = get_logger("auth")


def get_client_ip():
    if request.headers.get("X-Forwarded-For"):
        return request.headers.get("X-Forwarded-For").split(",")[0].strip()
    return request.remote_addr


def register_auth_hooks(app):
    @app.before_request
    def enforce_session_limits():
        if not current_user.is_authenticated:
            return None

        session_id = session.get("user_session_id")
        if not session_id:
            return None

        db = Session()
        try:
            user_session = db.query(UserSession).filter_by(id=session_id).first()
            if not user_session:
                return None

            if not user_session.is_valid:
                user_session.revoke()
                db.commit()
                return _force_logout(
                    "Sesión expirada. Inicia sesión nuevamente."
                )

            user_session.touch()
            db.commit()
        finally:
            Session.remove()

        return None


def _force_logout(message):
    session.clear()
    logout_user()

    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "error": message}), 401

    return redirect("/login")



@auth_bp.route("/api/login", methods=["POST"])
@limiter.limit("10 per minute", key_func=get_client_ip)
def api_login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({
            "ok": False,
            "error": "Usuario y contraseña requeridos"
        }), 400

    db = Session()
    try:
        user = db.query(User).filter_by(username=username).first()

        if not user or not user.check_password(password) or not user.is_active:
            log_audit(
                db,
                action="login_failed",
                details={"username": username},
                ip=get_client_ip(),
                user_agent=request.user_agent.string
            )
            db.commit()
            return jsonify({
                "ok": False,
                "error": "Usuario o contraseña incorrectos"
            }), 401

        expires_at = (
            datetime.now(timezone.utc) +
            timedelta(days=Config.SESSION_LIFETIME_DAYS)
        )
        user_session = UserSession(
            user_id=user.id,
            expires_at=expires_at,
            ip=get_client_ip(),
            user_agent=request.user_agent.string
        )
        db.add(user_session)

        user.last_login_at = datetime.now(timezone.utc)

        log_audit(
            db,
            action="login_success",
            actor_user_id=user.id,
            ip=get_client_ip(),
            user_agent=request.user_agent.string
        )

        db.commit()

        login_user(user, remember=False)

        session['user_session_id'] = str(user_session.id)

        if user.must_change_password:
            return jsonify({
                "ok": True,
                "redirect": "/change-password",
                "must_change_password": True
            })

        return jsonify({
            "ok": True,
            "redirect": "/projects",
            "must_change_password": False
        })

    finally:
        Session.remove()


@auth_bp.route("/api/logout", methods=["POST"])
@login_required
def api_logout():
    db = Session()
    try:
        # Revocar sesión
        session_id = session.get('user_session_id')
        if session_id:
            user_session = db.query(UserSession).filter_by(
                id=session_id
            ).first()
            if user_session:
                user_session.revoke()

        log_audit(
            db,
            action="logout",
            actor_user_id=current_user.id,
            ip=get_client_ip(),
            user_agent=request.user_agent.string
        )
        db.commit()
    finally:
        Session.remove()

    session.clear()
    logout_user()
    return jsonify({"ok": True, "redirect": "/login"})


@auth_bp.route("/api/change-password", methods=["POST"])
@login_required
def api_change_password():
    data = request.get_json() or {}
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({
            "ok": False,
            "error": "Todos los campos son requeridos"
        }), 400

    if len(new_password) < 8:
        return jsonify({
            "ok": False,
            "error": "La contraseña debe tener al menos 8 caracteres"
        }), 400

    db = Session()
    try:
        user = db.query(User).get(current_user.id)

        if not user.check_password(current_password):
            return jsonify({
                "ok": False,
                "error": "La contraseña actual es incorrecta"
            }), 401

        user.set_password(new_password)
        user.must_change_password = False

        log_audit(
            db,
            action="password_changed",
            actor_user_id=user.id,
            ip=get_client_ip(),
            user_agent=request.user_agent.string
        )

        db.commit()
        return jsonify({
            "ok": True,
            "redirect": "/projects"
        })

    finally:
        Session.remove()


@auth_bp.route("/api/me", methods=["GET"])
@limiter.exempt
@login_required
def api_me():
    return jsonify({
        "ok": True,
        "user": {
            "id": str(current_user.id),
            "username": current_user.username,
            "is_admin": current_user.is_admin,
            "must_change_password": current_user.must_change_password
        }
    })
