import secrets
import re
from datetime import datetime, timezone, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request, render_template
from flask_login import login_required, current_user
from sqlalchemy import func

from extensions import Session
from helpers import is_valid_uuid
from logger import get_logger
from models import (
    User,
    UserSession,
    AuditLog,
    Project,
    ProjectEvent,
    PhotoEvent,
    log_audit,
    utcnow
)
from services import project_store, retention, timeline


admin_bp = Blueprint("admin", __name__)
log = get_logger("admin")


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_admin:
            return jsonify({"ok": False, "error": "Acceso restringido"}), 403
        return f(*args, **kwargs)
    return decorated


def _parse_optional_int(value, field_name):
    if value is None:
        return None, None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, f"{field_name} debe ser entero"
    if parsed < 0:
        return None, f"{field_name} debe ser mayor o igual a 0"
    return parsed, None


def _generate_temp_password():
    return secrets.token_urlsafe(9)


def _client_ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr)


def _list_active_sessions(db):
    now = utcnow()
    sessions = (
        db.query(UserSession)
        .filter(UserSession.revoked_at.is_(None))
        .filter(UserSession.expires_at > now)
        .all()
    )
    return sessions


@admin_bp.route("/admin")
@login_required
@admin_required
def admin_overview_page():
    return render_template("admin/overview.html", active_page="admin-overview")


@admin_bp.route("/admin/users")
@login_required
@admin_required
def admin_users_page():
    return render_template("admin/users.html", active_page="admin-users")


@admin_bp.route("/admin/sessions")
@login_required
@admin_required
def admin_sessions_page():
    return render_template("admin/sessions.html", active_page="admin-sessions")


@admin_bp.route("/admin/audit")
@login_required
@admin_required
def admin_audit_page():
    return render_template("admin/audit.html", active_page="admin-audit")


@admin_bp.route("/api/admin/overview", methods=["GET"])
@login_required
@admin_required
def admin_overview():
    db = Session()
    try:
        now = utcnow()
        ten_min_ago = now - timedelta(minutes=10)
        last_24h = now - timedelta(hours=24)
        start_day = datetime.now(timezone.utc).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )

        active_users = db.query(User).filter_by(is_active=True).count()
        connected_users = (
            db.query(UserSession.user_id)
            .filter(UserSession.revoked_at.is_(None))
            .filter(UserSession.expires_at > now)
            .filter(UserSession.last_seen_at >= ten_min_ago)
            .distinct()
            .count()
        )

        jobs_processing = (
            db.query(Project)
            .filter(Project.status.in_(["queued", "processing"]))
            .count()
        )
        jobs_error = db.query(Project).filter(Project.status == "error").count()

        images_processing = 0
        processing_projects = (
            db.query(Project)
            .filter(Project.status.in_(["queued", "processing"]))
            .all()
        )
        for project in processing_projects:
            project_id = str(project.id)
            state = project_store.load_state(project_id) or {}
            if not state.get("stylize_photos", True):
                continue
            photos = timeline.get_photos(project_id)
            for photo in photos:
                if not photo.get("stylized_path"):
                    images_processing += 1

        return jsonify({
            "ok": True,
            "stats": {
                "jobs_processing": jobs_processing,
                "jobs_error": jobs_error,
                "images_processing": images_processing
            }
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/overview/projects-hourly", methods=["GET"])
@login_required
@admin_required
def admin_projects_hourly():
    date_value = request.args.get("date")
    if not date_value:
        return jsonify({"ok": False, "error": "date requerido"}), 400

    try:
        day_start = datetime.strptime(date_value, "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return jsonify({"ok": False, "error": "date inválido"}), 400

    day_end = day_start + timedelta(days=1)

    db = Session()
    try:
        project_rows = (
            db.query(
                func.date_trunc("hour", ProjectEvent.created_at).label("hour"),
                func.count(ProjectEvent.id)
            )
            .filter(ProjectEvent.created_at >= day_start)
            .filter(ProjectEvent.created_at < day_end)
            .group_by("hour")
            .order_by("hour")
            .all()
        )
        photo_rows = (
            db.query(
                func.date_trunc("hour", PhotoEvent.created_at).label("hour"),
                func.count(PhotoEvent.id)
            )
            .filter(PhotoEvent.created_at >= day_start)
            .filter(PhotoEvent.created_at < day_end)
            .group_by("hour")
            .order_by("hour")
            .all()
        )

        project_map = {row[0]: row[1] for row in project_rows}
        photo_map = {row[0]: row[1] for row in photo_rows}
        hours = []
        project_counts = []
        photo_counts = []
        cursor = day_start
        while cursor < day_end:
            label = cursor.strftime("%H:%M")
            hours.append(label)
            project_counts.append(int(project_map.get(cursor, 0)))
            photo_counts.append(int(photo_map.get(cursor, 0)))
            cursor += timedelta(hours=1)

        return jsonify({
            "ok": True,
            "hours": hours,
            "project_counts": project_counts,
            "photo_counts": photo_counts
        })
    finally:
        Session.remove()




@admin_bp.route("/api/admin/users", methods=["GET"])
@login_required
@admin_required
def list_users():
    db = Session()
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        return jsonify({
            "ok": True,
            "users": [
                {
                    "id": str(user.id),
                    "username": user.username,
                    "is_admin": user.is_admin,
                    "is_active": user.is_active,
                    "must_change_password": user.must_change_password,
                    "can_stylize_images": user.can_stylize_images,
                    "daily_stylize_quota": user.daily_stylize_quota,
                    "recording_minutes_quota": user.recording_minutes_quota,
                    "recording_seconds_used": user.recording_seconds_used,
                    "recording_window_days": user.recording_window_days,
                    "recording_window_started_at": (
                        user.recording_window_started_at.isoformat()
                        if user.recording_window_started_at else None
                    ),
                    "stylizes_used_in_window": user.stylizes_used_in_window,
                    "created_at": (
                        user.created_at.isoformat() if user.created_at else None
                    ),
                    "last_login_at": (
                        user.last_login_at.isoformat() if user.last_login_at else None
                    )
                }
                for user in users
            ]
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/users", methods=["POST"])
@login_required
@admin_required
def create_user():
    data = request.get_json() or {}
    username = data.get("username", "").strip()

    if not re.match(r"^[a-z0-9_]+$", username):
        return jsonify({
            "ok": False,
            "error": "El username solo puede contener letras minúsculas, números y guion bajo"
        }), 400
    is_active = data.get("is_active", True)

    daily_stylize_quota, error = _parse_optional_int(
        data.get("daily_stylize_quota"),
        "daily_stylize_quota"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    recording_minutes_quota, error = _parse_optional_int(
        data.get("recording_minutes_quota"),
        "recording_minutes_quota"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    recording_window_days, error = _parse_optional_int(
        data.get("recording_window_days"),
        "recording_window_days"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    can_stylize_images = bool(data.get("can_stylize_images", False))

    if not username:
        return jsonify({"ok": False, "error": "username requerido"}), 400

    temp_password = _generate_temp_password()

    db = Session()
    try:
        existing = db.query(User).filter_by(username=username).first()
        if existing:
            return jsonify({"ok": False, "error": "Usuario ya existe"}), 409

        user = User(
            username=username,
            is_admin=False,
            is_active=bool(is_active),
            must_change_password=True,
            can_stylize_images=can_stylize_images,
            daily_stylize_quota=daily_stylize_quota,
            recording_minutes_quota=recording_minutes_quota,
            recording_window_days=recording_window_days
        )
        user.set_password(temp_password)

        db.add(user)
        log_audit(
            db,
            action="admin_create_user",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            details={"username": username},
            ip=_client_ip(),
            user_agent=request.user_agent.string
        )
        db.commit()

        return jsonify({
            "ok": True,
            "user": {
                "id": str(user.id),
                "username": user.username
            },
            "temp_password": temp_password
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/user/<user_id>/reset-password", methods=["POST"])
@login_required
@admin_required
def reset_user_password(user_id):
    if not is_valid_uuid(user_id):
        return jsonify({"ok": False, "error": "user_id inválido"}), 400

    temp_password = _generate_temp_password()

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"ok": False, "error": "Usuario no encontrado"}), 404

        user.set_password(temp_password)
        user.must_change_password = True

        log_audit(
            db,
            action="admin_reset_password",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            ip=_client_ip(),
            user_agent=request.user_agent.string
        )
        db.commit()

        return jsonify({
            "ok": True,
            "user": {"id": str(user.id), "username": user.username},
            "temp_password": temp_password
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/user/<user_id>/deactivate", methods=["POST"])
@login_required
@admin_required
def deactivate_user(user_id):
    if not is_valid_uuid(user_id):
        return jsonify({"ok": False, "error": "user_id inválido"}), 400

    if str(current_user.id) == user_id:
        return jsonify({"ok": False, "error": "No puedes desactivarte"}), 400

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"ok": False, "error": "Usuario no encontrado"}), 404

        user.is_active = False
        sessions = _list_active_sessions(db)
        for session in sessions:
            if session.user_id == user.id:
                session.revoke()

        log_audit(
            db,
            action="admin_deactivate_user",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            ip=_client_ip(),
            user_agent=request.user_agent.string
        )
        db.commit()

        return jsonify({"ok": True})
    finally:
        Session.remove()


@admin_bp.route("/api/admin/user/<user_id>/activate", methods=["POST"])
@login_required
@admin_required
def activate_user(user_id):
    if not is_valid_uuid(user_id):
        return jsonify({"ok": False, "error": "user_id inválido"}), 400

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"ok": False, "error": "Usuario no encontrado"}), 404

        user.is_active = True

        log_audit(
            db,
            action="admin_activate_user",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            ip=_client_ip(),
            user_agent=request.user_agent.string
        )
        db.commit()

        return jsonify({"ok": True})
    finally:
        Session.remove()


@admin_bp.route("/api/admin/user/<user_id>", methods=["DELETE"])
@login_required
@admin_required
def delete_user(user_id):
    if not is_valid_uuid(user_id):
        return jsonify({"ok": False, "error": "user_id inválido"}), 400

    if str(current_user.id) == user_id:
        return jsonify({"ok": False, "error": "No puedes eliminarte"}), 400

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"ok": False, "error": "Usuario no encontrado"}), 404

        project_ids = [str(project.id) for project in user.projects.all()]

        for project_id in project_ids:
            try:
                project_store.delete_project(project_id)
            except Exception as e:
                log.warning(
                    f"No se pudo eliminar proyecto {project_id}: {e}"
                )

        db.query(UserSession).filter_by(user_id=user.id).delete()

        log_audit(
            db,
            action="admin_delete_user",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            details={
                "username": user.username,
                "deleted_projects": project_ids
            },
            ip=_client_ip(),
            user_agent=request.user_agent.string
        )
        db.delete(user)
        db.commit()

        return jsonify({"ok": True})
    finally:
        Session.remove()


@admin_bp.route("/api/admin/sessions", methods=["GET"])
@login_required
@admin_required
def list_sessions():
    db = Session()
    try:
        now = utcnow()
        ten_min_ago = now - timedelta(minutes=10)
        sessions = (
            db.query(UserSession)
            .filter(UserSession.revoked_at.is_(None))
            .filter(UserSession.expires_at > now)
            .order_by(UserSession.last_seen_at.desc())
            .all()
        )

        user_map = {
            str(user.id): user.username
            for user in db.query(User).all()
        }

        return jsonify({
            "ok": True,
            "sessions": [
                {
                    "id": str(session.id),
                    "user_id": str(session.user_id),
                    "username": user_map.get(str(session.user_id), ""),
                    "created_at": session.created_at.isoformat(),
                    "last_seen_at": session.last_seen_at.isoformat(),
                    "expires_at": session.expires_at.isoformat(),
                    "ip": session.ip,
                    "user_agent": session.user_agent,
                    "is_connected": session.last_seen_at >= ten_min_ago
                }
                for session in sessions
            ]
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/sessions/<session_id>/revoke", methods=["POST"])
@login_required
@admin_required
def revoke_session(session_id):
    db = Session()
    try:
        session_record = db.query(UserSession).filter_by(id=session_id).first()
        if not session_record:
            return jsonify({"ok": False, "error": "Sesión no encontrada"}), 404

        session_record.revoke()
        log_audit(
            db,
            action="admin_revoke_session",
            actor_user_id=current_user.id,
            target_user_id=session_record.user_id,
            details={"session_id": str(session_record.id)},
            ip=_client_ip(),
            user_agent=request.user_agent.string
        )
        db.commit()

        return jsonify({"ok": True})
    finally:
        Session.remove()


@admin_bp.route("/api/admin/audit", methods=["GET"])
@login_required
@admin_required
def audit_logs():
    action = request.args.get("action")
    actor_user_id = request.args.get("actor_user_id")
    target_user_id = request.args.get("target_user_id")
    limit = request.args.get("limit", "50")

    try:
        limit_value = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit_value = 50

    db = Session()
    try:
        query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
        if action:
            query = query.filter(AuditLog.action == action)
        if actor_user_id and is_valid_uuid(actor_user_id):
            query = query.filter(AuditLog.actor_user_id == actor_user_id)
        if target_user_id and is_valid_uuid(target_user_id):
            query = query.filter(AuditLog.target_user_id == target_user_id)

        logs = query.limit(limit_value).all()
        user_ids = set()
        for entry in logs:
            if entry.actor_user_id:
                user_ids.add(entry.actor_user_id)
            if entry.target_user_id:
                user_ids.add(entry.target_user_id)

        users = {}
        if user_ids:
            for user in db.query(User).filter(User.id.in_(user_ids)).all():
                users[str(user.id)] = user.username

        return jsonify({
            "ok": True,
            "logs": [
                {
                    "id": entry.id,
                    "action": entry.action,
                    "actor_user_id": (
                        str(entry.actor_user_id) if entry.actor_user_id else None
                    ),
                    "actor_username": users.get(
                        str(entry.actor_user_id), ""
                    ),
                    "target_user_id": (
                        str(entry.target_user_id) if entry.target_user_id else None
                    ),
                    "target_username": users.get(
                        str(entry.target_user_id), ""
                    ),
                    "details": entry.details,
                    "created_at": entry.created_at.isoformat(),
                    "ip": entry.ip
                }
                for entry in logs
            ]
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/audit/clear", methods=["POST"])
@login_required
@admin_required
def clear_audit_logs():
    db = Session()
    try:
        db.query(AuditLog).delete(synchronize_session=False)
        db.commit()
        return jsonify({"ok": True})
    finally:
        Session.remove()


@admin_bp.route("/api/admin/cleanup-events", methods=["POST"])
@login_required
@admin_required
def cleanup_events():
    deleted = retention.cleanup_expired_events()
    return jsonify({"ok": True, "deleted": deleted})


@admin_bp.route("/api/admin/user/<user_id>/flags", methods=["PATCH"])
@login_required
@admin_required
def update_user_flags(user_id):
    if not is_valid_uuid(user_id):
        return jsonify({"ok": False, "error": "user_id inválido"}), 400

    data = request.get_json() or {}

    daily_stylize_quota, error = _parse_optional_int(
        data.get("daily_stylize_quota"),
        "daily_stylize_quota"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    recording_minutes_quota, error = _parse_optional_int(
        data.get("recording_minutes_quota"),
        "recording_minutes_quota"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    recording_window_days, error = _parse_optional_int(
        data.get("recording_window_days"),
        "recording_window_days"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    can_stylize_images = data.get("can_stylize_images")

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"ok": False, "error": "Usuario no encontrado"}), 404

        changes = {}

        if can_stylize_images is not None:
            user.can_stylize_images = bool(can_stylize_images)
            changes["can_stylize_images"] = user.can_stylize_images

        if "daily_stylize_quota" in data:
            user.daily_stylize_quota = daily_stylize_quota
            changes["daily_stylize_quota"] = daily_stylize_quota

        if "recording_minutes_quota" in data:
            user.recording_minutes_quota = recording_minutes_quota
            changes["recording_minutes_quota"] = recording_minutes_quota

        if "recording_window_days" in data:
            user.recording_window_days = recording_window_days
            changes["recording_window_days"] = recording_window_days

        if not changes:
            return jsonify({"ok": False, "error": "Sin cambios"}), 400

        log_audit(
            db,
            action="admin_update_flags",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            details=changes,
            ip=request.remote_addr,
            user_agent=request.user_agent.string
        )
        db.commit()

        log.info(f"Admin {current_user.id} actualizó flags user={user.id}")

        return jsonify({
            "ok": True,
            "user": {
                "id": str(user.id),
                "can_stylize_images": user.can_stylize_images,
                "daily_stylize_quota": user.daily_stylize_quota,
                "recording_minutes_quota": user.recording_minutes_quota,
                "recording_seconds_used": user.recording_seconds_used,
                "recording_window_days": user.recording_window_days,
                "recording_window_started_at": (
                    user.recording_window_started_at.isoformat()
                    if user.recording_window_started_at else None
                )
            }
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/user/<user_id>/quota", methods=["POST"])
@login_required
@admin_required
def update_user_quota(user_id):
    if not is_valid_uuid(user_id):
        return jsonify({"ok": False, "error": "user_id inválido"}), 400

    data = request.get_json() or {}

    reset_stylize = bool(data.get("reset_stylize"))
    reset_recording = bool(data.get("reset_recording"))

    extra_stylizes, error = _parse_optional_int(
        data.get("extra_stylizes"),
        "extra_stylizes"
    )
    if error:
        return jsonify({"ok": False, "error": error}), 400

    if not any([
        reset_stylize,
        reset_recording,
        extra_stylizes
    ]):
        return jsonify({"ok": False, "error": "Sin cambios"}), 400

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"ok": False, "error": "Usuario no encontrado"}), 404

        now = utcnow()
        changes = {}

        if reset_stylize:
            user.stylizes_used_in_window = 0
            user.stylize_window_started_at = now
            changes["stylizes_used_in_window"] = 0

        if reset_recording:
            user.recording_seconds_used = 0
            user.recording_window_started_at = now
            changes["recording_seconds_used"] = 0

        if extra_stylizes:
            current = user.stylizes_used_in_window or 0
            user.stylizes_used_in_window = max(0, current - extra_stylizes)
            changes["extra_stylizes"] = extra_stylizes

        log_audit(
            db,
            action="admin_update_quota",
            actor_user_id=current_user.id,
            target_user_id=user.id,
            details=changes,
            ip=request.remote_addr,
            user_agent=request.user_agent.string
        )
        db.commit()

        return jsonify({
            "ok": True,
            "user": {
                "id": str(user.id),
                "stylizes_used_in_window": user.stylizes_used_in_window,
                "stylize_window_started_at": (
                    user.stylize_window_started_at.isoformat()
                    if user.stylize_window_started_at else None
                ),
                "recording_seconds_used": user.recording_seconds_used,
                "recording_window_started_at": (
                    user.recording_window_started_at.isoformat()
                    if user.recording_window_started_at else None
                )
            }
        })
    finally:
        Session.remove()
