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
    return jsonify({
        "chunk_duration": Config.CHUNK_DURATION
    })
