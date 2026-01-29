import secrets
import re
from datetime import datetime, timezone, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy import func, or_
from sqlalchemy.orm import aliased

from extensions import Session, limiter
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


@admin_bp.route("/api/admin/overview", methods=["GET"])
@limiter.exempt
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

        active_projects = (
            db.query(Project)
            .filter(Project.status.in_(["queued", "processing"]))
            .all()
        )
        projects_error = db.query(Project).filter(Project.status == "error").count()

        segments_pending = 0
        photos_pending = 0
        for project in active_projects:
            project_id = str(project.id)
            state = project_store.load_state(project_id) or {}
            segments = state.get("segments") or {}
            for segment in segments.values():
                if segment.get("status") != "done":
                    segments_pending += 1
            if state.get("stylize_photos", True):
                photos = timeline.get_photos(project_id)
                for photo in photos:
                    if not photo.get("stylized_path"):
                        photos_pending += 1

        return jsonify({
            "ok": True,
            "stats": {
                "projects_active": len(active_projects),
                "projects_error": projects_error,
                "segments_pending": segments_pending,
                "photos_pending": photos_pending
            }
        })
    finally:
        Session.remove()


@admin_bp.route("/api/admin/overview/projects-hourly", methods=["GET"])
@limiter.exempt
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


@admin_bp.route("/api/admin/overview/processing-history", methods=["GET"])
@limiter.exempt
@login_required
@admin_required
def admin_processing_history():
    db = Session()
    try:
        boundary_hours = 24
        now = utcnow()
        start = now - timedelta(hours=boundary_hours)

        projects = (
            db.query(Project)
            .filter(Project.status == "done")
            .filter(Project.updated_at >= start)
            .all()
        )

        hourly_buckets = {}
        for offset in range(boundary_hours):
            bucket_time = start + timedelta(hours=offset)
            key = bucket_time.strftime("%H:00")
            hourly_buckets[key] = {
                "total": [],
                "transcription": [],
                "stylize": []
            }

        for project in projects:
            state = project_store.load_state(str(project.id)) or {}
            metrics = state.get("processing_metrics")
            if not metrics:
                continue

            updated_at = project.updated_at or now
            key = updated_at.strftime("%H:00")
            bucket = hourly_buckets.get(key)
            if not bucket:
                continue

            bucket["total"].append(metrics.get("total_time", 0))
            bucket["transcription"].append(metrics.get("avg_transcription_time", 0))
            bucket["stylize"].append(metrics.get("avg_stylize_time", 0))

        labels = []
        pipeline_times = []
        segment_times = []
        photo_times = []

        def _avg(values):
            return round(sum(values) / len(values), 2) if values else 0.0

        for offset in range(boundary_hours):
            bucket_time = start + timedelta(hours=offset)
            key = bucket_time.strftime("%H:00")
            bucket = hourly_buckets[key]

            labels.append(key)
            pipeline_times.append(_avg(bucket["total"]))
            segment_times.append(_avg(bucket["transcription"]))
            photo_times.append(_avg(bucket["stylize"]))

        date_info = {
            "start": start.strftime("%Y-%m-%d %H:%M"),
            "end": now.strftime("%Y-%m-%d %H:%M"),
            "projects_count": len(projects)
        }

        return jsonify({
            "ok": True,
            "labels": labels,
            "pipeline_times": pipeline_times,
            "segment_times": segment_times,
            "photo_times": photo_times,
            "date_info": date_info
        })
    finally:
        Session.remove()




@admin_bp.route("/api/admin/users", methods=["GET"])
@login_required
@admin_required
def list_users():
    limit = request.args.get("limit", "10")
    offset = request.args.get("offset", "0")
    query = request.args.get("q", "").strip()

    try:
        limit_value = max(1, min(int(limit), 100))
    except (TypeError, ValueError):
        limit_value = 10

    try:
        offset_value = max(0, int(offset))
    except (TypeError, ValueError):
        offset_value = 0

    db = Session()
    try:
        base_query = db.query(User)
        if query:
            like_query = f"%{query}%"
            base_query = base_query.filter(User.username.ilike(like_query))
        total = base_query.count()
        users = (
            base_query.order_by(User.created_at.desc())
            .offset(offset_value)
            .limit(limit_value)
            .all()
        )
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
            ],
            "total": total,
            "limit": limit_value,
            "offset": offset_value
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
    limit = request.args.get("limit", "10")
    offset = request.args.get("offset", "0")
    query = request.args.get("q", "").strip()

    try:
        limit_value = max(1, min(int(limit), 100))
    except (TypeError, ValueError):
        limit_value = 10

    try:
        offset_value = max(0, int(offset))
    except (TypeError, ValueError):
        offset_value = 0

    db = Session()
    try:
        now = utcnow()
        ten_min_ago = now - timedelta(minutes=10)
        base_query = (
            db.query(UserSession, User.username)
            .join(User, UserSession.user_id == User.id)
            .filter(UserSession.revoked_at.is_(None))
            .filter(UserSession.expires_at > now)
        )
        if query:
            like_query = f"%{query}%"
            base_query = base_query.filter(
                or_(
                    User.username.ilike(like_query),
                    UserSession.ip.ilike(like_query)
                )
            )
        total = base_query.count()
        rows = (
            base_query.order_by(UserSession.last_seen_at.desc())
            .offset(offset_value)
            .limit(limit_value)
            .all()
        )

        return jsonify({
            "ok": True,
            "sessions": [
                {
                    "id": str(session.id),
                    "user_id": str(session.user_id),
                    "username": username,
                    "created_at": session.created_at.isoformat(),
                    "last_seen_at": session.last_seen_at.isoformat(),
                    "expires_at": session.expires_at.isoformat(),
                    "ip": session.ip,
                    "user_agent": session.user_agent,
                    "is_connected": session.last_seen_at >= ten_min_ago
                }
                for session, username in rows
            ],
            "total": total,
            "limit": limit_value,
            "offset": offset_value
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
    limit = request.args.get("limit", "10")
    offset = request.args.get("offset", "0")
    query = request.args.get("q", "").strip()

    try:
        limit_value = max(1, min(int(limit), 100))
    except (TypeError, ValueError):
        limit_value = 10

    try:
        offset_value = max(0, int(offset))
    except (TypeError, ValueError):
        offset_value = 0

    db = Session()
    try:
        Actor = aliased(User)
        Target = aliased(User)
        base_query = (
            db.query(
                AuditLog,
                Actor.username.label("actor_username"),
                Target.username.label("target_username")
            )
            .outerjoin(Actor, AuditLog.actor_user_id == Actor.id)
            .outerjoin(Target, AuditLog.target_user_id == Target.id)
        )
        if action:
            base_query = base_query.filter(AuditLog.action == action)
        if actor_user_id and is_valid_uuid(actor_user_id):
            base_query = base_query.filter(AuditLog.actor_user_id == actor_user_id)
        if target_user_id and is_valid_uuid(target_user_id):
            base_query = base_query.filter(AuditLog.target_user_id == target_user_id)
        if query:
            like_query = f"%{query}%"
            base_query = base_query.filter(
                or_(
                    AuditLog.action.ilike(like_query),
                    AuditLog.ip.ilike(like_query),
                    Actor.username.ilike(like_query),
                    Target.username.ilike(like_query)
                )
            )

        total = base_query.count()
        rows = (
            base_query.order_by(AuditLog.created_at.desc())
            .offset(offset_value)
            .limit(limit_value)
            .all()
        )

        return jsonify({
            "ok": True,
            "logs": [
                {
                    "id": entry.id,
                    "action": entry.action,
                    "actor_user_id": (
                        str(entry.actor_user_id) if entry.actor_user_id else None
                    ),
                    "actor_username": actor_username or "",
                    "target_user_id": (
                        str(entry.target_user_id) if entry.target_user_id else None
                    ),
                    "target_username": target_username or "",
                    "details": entry.details,
                    "created_at": entry.created_at.isoformat(),
                    "ip": entry.ip
                }
                for entry, actor_username, target_username in rows
            ],
            "total": total,
            "limit": limit_value,
            "offset": offset_value
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

    if not any([reset_stylize, reset_recording]):
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
