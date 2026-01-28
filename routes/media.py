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
from services.audio_convert import webm_to_wav, FFmpegNotFoundError, ConversionError

log = get_logger("media")

media_bp = Blueprint('media', __name__)


@media_bp.route("/api/audio/chunk", methods=["POST"])
@limiter.limit(LIMITS["audio_chunk"])
@login_required
def audio_chunk():
    project_id = request.form.get("project_id")
    chunk_index = request.form.get("chunk_index")

    if not project_id:
        return jsonify({"ok": False, "error": "project_id requerido"}), 400

    if not is_valid_uuid(project_id):
        return jsonify({"ok": False, "error": "project_id inválido"}), 400

    if not project_store.user_owns_project(project_id, current_user.id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if chunk_index is None:
        return jsonify({"ok": False, "error": "chunk_index requerido"}), 400

    try:
        chunk_index = int(chunk_index)
    except ValueError:
        return jsonify({"ok": False, "error": "chunk_index debe ser entero"}), 400

    if chunk_index < 0:
        return jsonify({"ok": False, "error": "chunk_index debe ser mayor o igual a 0"}), 400

    if not project_store.project_exists(project_id):
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    if project_store.is_project_stopped(project_id):
        return jsonify({"ok": False, "error": "El proyecto está detenido"}), 403

    if project_store.is_recording_limit_exceeded(project_id):
        return jsonify({
            "ok": False,
            "error": "Tiempo de grabación agotado"
        }), 403

    if "file" not in request.files:
        return jsonify({"ok": False, "error": "archivo requerido"}), 400

    file = request.files["file"]
    file_content = file.read()
    file_size = len(file_content)

    if file_size > Config.MAX_CHUNK_SIZE:
        return jsonify({"ok": False, "error": "chunk demasiado grande"}), 400

    if file_size < 100:
        return jsonify({"ok": False, "error": "chunk demasiado pequeño"}), 400

    project_dir = project_store.get_project_dir(project_id)
    webm_path = os.path.join(project_dir, "audio_chunks", f"chunk_{chunk_index}.webm")
    wav_path = os.path.join(project_dir, "wav_chunks", f"chunk_{chunk_index}.wav")

    with open(webm_path, "wb") as f:
        f.write(file_content)

    try:
        webm_to_wav(webm_path, wav_path)
    except FFmpegNotFoundError as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    except ConversionError as e:
        return jsonify({"ok": False, "error": f"falló la conversión: {str(e)}"}), 500

    try:
        project_store.append_chunk_result(
            project_id,
            chunk_index,
            webm_path,
            wav_path,
            ""
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 403

    log.info(f"Chunk {chunk_index} almacenado para proyecto {project_id}")

    return jsonify({
        "ok": True,
        "chunk_index": chunk_index
    })


@media_bp.route("/api/photo", methods=["POST"])
@limiter.limit(LIMITS["photo"])
@login_required
def upload_photo():
    data = request.get_json() or {}
    project_id = data.get("project_id")
    photo_id = data.get("photo_id")
    t_ms = data.get("t_ms")
    data_url = data.get("data_url")
    after_chunk_index = data.get("after_chunk_index")

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
        photo_path,
        after_chunk_index=after_chunk_index
    )

    log.info(
        "Foto %s registrada para proyecto %s después del chunk %s",
        photo_id,
        project_id,
        after_chunk_index if after_chunk_index is not None else "?"
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
        "t_ms": t_ms,
        "after_chunk_index": after_chunk_index
    })
    if after_chunk_index is not None:
        try:
            after_chunk_index = int(after_chunk_index)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "after_chunk_index debe ser entero"}), 400
        if after_chunk_index < 0:
            return jsonify({"ok": False, "error": "after_chunk_index inválido"}), 400
