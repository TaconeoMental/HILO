from flask import Blueprint, jsonify
from flask_login import login_required

from config import Config
from extensions import limiter
pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/health")
@limiter.exempt
def health():
    return jsonify({"ok": True})


@pages_bp.route("/api/config")
@login_required
def get_config():
    chunk_seconds = Config.AUDIO_CHUNK_SECONDS
    return jsonify({
        "chunk_duration": chunk_seconds,
        "chunk_duration_seconds": chunk_seconds,
        "chunk_duration_ms": chunk_seconds * 1000,
        "audio_ws_path": Config.AUDIO_WS_PATH
    })
