from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from helpers import is_valid_uuid
from extensions import limiter, LIMITS
from services import project_store
from services.jobs import orchestrator
from datetime import datetime

from extensions import Session
from models import utcnow, log_audit_for_request
from services import quotas
from config import Config


projects_bp = Blueprint('projects', __name__)



@projects_bp.route("/api/project/start", methods=["POST"])
@limiter.limit(LIMITS["project_start"])
@login_required
def project_start():
    data = request.get_json() or {}
    project_name = data.get("project_name", "")
    participant_name = data.get("participant_name", "")

    try:
        recording_quota = None
        if not current_user.is_admin:
            recording_quota = quotas.get_recording_quota(current_user.id)
            if recording_quota and recording_quota["total_seconds"] is not None:
                if recording_quota["remaining_seconds"] <= 0:
                    reset_at = recording_quota.get("reset_at")
                    return jsonify({
                        "ok": False,
                        "error": "No tienes minutos disponibles",
                        "recording_remaining_seconds": 0,
                        "recording_reset_at": (
                            reset_at.isoformat() if reset_at else None
                        ),
                        "recording_window_days": recording_quota.get("window_days")
                    }), 403

        project_id = project_store.create_project(
            current_user.id,
            project_name,
            participant_name,
            quota_reserved=not current_user.is_admin
        )
        recording_limit_seconds = None
        if recording_quota and recording_quota["total_seconds"] is not None:
            recording_limit_seconds = recording_quota["remaining_seconds"]
        project_store.update_state_fields(project_id, {
            "recording_limit_seconds": recording_limit_seconds
        })
        state = project_store.load_state(project_id) or {}
        db = Session()
        try:
            log_audit_for_request(
                db,
                action="recording_started",
                actor_user_id=current_user.id,
                target_user_id=current_user.id,
                details={
                    "project_id": project_id,
                    "project_name": project_name,
                    "participant_name": participant_name,
                    "recording_started_at": state.get("recording_started_at")
                },
                request=request
            )
            db.commit()
        finally:
            Session.remove()
        return jsonify({
            "ok": True,
            "project_id": project_id,
            "recording_started_at": state.get("recording_started_at"),
            "server_now": utcnow().isoformat(),
            "chunk_duration_seconds": Config.AUDIO_CHUNK_SECONDS,
            "recording_total_seconds": (
                recording_quota.get("total_seconds")
                if recording_quota else None
            ),
            "recording_remaining_seconds": (
                recording_quota.get("remaining_seconds")
                if recording_quota else None
            ),
            "recording_reset_at": (
                recording_quota.get("reset_at").isoformat()
                if recording_quota and recording_quota.get("reset_at")
                else None
            ),
            "recording_window_days": (
                recording_quota.get("window_days")
                if recording_quota else None
            )
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@projects_bp.route("/api/project/stop", methods=["POST"])
@limiter.limit(LIMITS["project_stop"])
@login_required
def project_stop():
    data = request.get_json() or {}
    project_id = data.get("project_id")
    participant_name = data.get("participant_name", "ACTOR")
    project_name = data.get("project_name", "")
    stylize_photos = data.get("stylize_photos", True)

    if not project_id:
        return jsonify({"ok": False, "error": "project_id requerido"}), 400

    if not is_valid_uuid(project_id):
        return jsonify({"ok": False, "error": "project_id inválido"}), 400

    if not project_store.user_owns_project(project_id, current_user.id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if not project_store.project_exists(project_id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if project_store.is_project_stopped(project_id):
        return jsonify({"ok": False, "error": "El proyecto ya fue detenido"}), 400

    try:
        if stylize_photos and not current_user.is_admin:
            if not current_user.can_stylize_images:
                stylize_photos = False

        project_store.update_state_fields(project_id, {
            "participant_name": participant_name,
            "project_name": project_name,
            "stylize_photos": stylize_photos
        })
        state = project_store.mark_stopped(project_id) or {}
        enqueue_job = orchestrator.enqueue_processing_pipeline(project_id)

        result_url = f"/r/{project_id}"

        started_at = state.get("recording_started_at")
        recording_limit_seconds = state.get("recording_limit_seconds")
        ingest_duration_ms = (state.get("ingest") or {}).get("duration_ms")
        if ingest_duration_ms:
            duration_seconds = int(ingest_duration_ms / 1000)
            project_store.update_state_fields(project_id, {
                "recording_duration_seconds": duration_seconds
            })
        elif isinstance(started_at, str) and started_at:
            duration_seconds = None
            try:
                duration_seconds = (
                    utcnow() - datetime.fromisoformat(started_at)
                ).total_seconds()
            except (TypeError, ValueError):
                duration_seconds = None

            if (
                duration_seconds is not None
                and recording_limit_seconds is not None
            ):
                duration_seconds = min(
                    duration_seconds,
                    float(recording_limit_seconds)
                )
            if duration_seconds is not None:
                project_store.update_state_fields(project_id, {
                    "recording_duration_seconds": int(duration_seconds)
                })

            db = Session()
            try:
                log_audit_for_request(
                    db,
                    action="recording_finished",
                    actor_user_id=current_user.id,
                    target_user_id=current_user.id,
                    details={
                        "project_id": project_id,
                        "project_name": project_name,
                        "participant_name": participant_name,
                        "recording_started_at": started_at,
                        "recording_stopped_at": utcnow().isoformat(),
                        "duration_seconds": duration_seconds
                    },
                    request=request
                )
                db.commit()
            finally:
                Session.remove()

        return jsonify({
            "ok": True,
            "project_id": project_id,
            "queue_job_id": enqueue_job.id,
            "result_url": result_url,
            "stylize_applied": stylize_photos
        })
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        if project_store.project_exists(project_id):
            project_store.update_project_status(
                project_id,
                "error",
                error_message=str(e)
            )
        return jsonify({"ok": False, "error": str(e)}), 500


@projects_bp.route("/api/projects", methods=["GET"])
@limiter.exempt
@login_required
def list_projects():
    limit = request.args.get("limit", "10")
    offset = request.args.get("offset", "0")
    query = request.args.get("q", "").strip()
    status = request.args.get("status", "").strip()

    try:
        limit_value = max(1, min(int(limit), 100))
    except ValueError:
        limit_value = 10

    try:
        offset_value = max(0, int(offset))
    except ValueError:
        offset_value = 0

    projects, total = project_store.list_projects(
        current_user.id,
        limit=limit_value,
        offset=offset_value,
        query=query or None,
        status=status or None
    )
    return jsonify({
        "ok": True,
        "projects": projects,
        "total": total,
        "limit": limit_value,
        "offset": offset_value
    })


@projects_bp.route("/api/project/<project_id>", methods=["DELETE"])
@login_required
def delete_project(project_id):
    if not is_valid_uuid(project_id):
        return jsonify({"ok": False, "error": "project_id inválido"}), 400

    if not project_store.user_owns_project(project_id, current_user.id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if not project_store.project_exists(project_id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    try:
        project_store.delete_project(project_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
