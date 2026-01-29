import os
import uuid

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from config import Config
from helpers import is_valid_uuid, parse_data_url, get_image_extension
from extensions import limiter, LIMITS, Session
from logger import get_logger
from models import PhotoEvent
from services import project_store, timeline

log = get_logger("media")

media_bp = Blueprint('media', __name__)


@media_bp.route("/api/photo", methods=["POST"])
@limiter.limit(LIMITS["photo"])
@login_required
def upload_photo():
    data = request.get_json() or {}
    project_id = data.get("project_id")
    photo_id = data.get("photo_id")
    t_ms = data.get("t_ms")
    data_url = data.get("data_url")

    if not project_id:
        return jsonify({"ok": False, "error": "project_id requerido"}), 400

    if not is_valid_uuid(project_id):
        return jsonify({"ok": False, "error": "project_id inválido"}), 400

    if not project_store.user_owns_project(project_id, current_user.id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if not photo_id:
        return jsonify({"ok": False, "error": "photo_id requerido"}), 400

    if t_ms is None:
        return jsonify({"ok": False, "error": "t_ms requerido"}), 400
    try:
        t_ms = int(t_ms)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "t_ms debe ser entero"}), 400
    if t_ms < 0:
        return jsonify({"ok": False, "error": "t_ms inválido"}), 400

    if not data_url:
        return jsonify({"ok": False, "error": "data_url requerido"}), 400

    if not project_store.project_exists(project_id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if project_store.is_project_stopped(project_id):
        return jsonify({"ok": False, "error": "El proyecto está detenido"}), 403

    if project_store.is_recording_limit_exceeded(project_id):
        return jsonify({
            "ok": False,
            "error": "Tiempo de grabación agotado"
        }), 403

    if not is_valid_uuid(photo_id):
        return jsonify({"ok": False, "error": "photo_id inválido"}), 400

    header, image_data = parse_data_url(data_url)
    if header is None:
        return jsonify({"ok": False, "error": "data_url inválido"}), 400
    if image_data is None:
        return jsonify({"ok": False, "error": "data_url inválido"}), 400

    if len(image_data) > Config.MAX_IMAGE_SIZE:
        return jsonify({"ok": False, "error": "imagen demasiado grande"}), 400

    ext = get_image_extension(header)

    project_dir = project_store.get_project_dir(project_id)
    photo_filename = f"photo_{photo_id}.{ext}"
    photo_path = os.path.join(project_dir, "photos", photo_filename)

    with open(photo_path, "wb") as f:
        f.write(image_data)

    timeline.add_photo(
        project_id,
        photo_id,
        t_ms,
        photo_path
    )

    log.info(
        "Foto %s registrada para proyecto %s en t=%sms",
        photo_id,
        project_id,
        t_ms
    )

    db = Session()
    try:
        db.add(PhotoEvent(
            project_id=uuid.UUID(project_id),
            user_id=current_user.id
        ))
        db.commit()
    finally:
        Session.remove()

    return jsonify({
        "ok": True,
        "photo_id": photo_id,
        "t_ms": t_ms
    })
