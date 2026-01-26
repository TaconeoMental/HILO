from flask import Blueprint, render_template, jsonify, redirect, url_for
from flask_login import login_required, current_user

from config import Config
from extensions import limiter
from routes.auth import must_change_password_redirect

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    if current_user.is_authenticated:
        if current_user.must_change_password:
            return redirect(url_for("auth.change_password_page"))
        return redirect(url_for("pages.projects_page"))
    return redirect(url_for("auth.login_page"))


@pages_bp.route("/projects")
@login_required
@must_change_password_redirect
def projects_page():
    return render_template("projects.html")


@pages_bp.route("/record")
@login_required
@must_change_password_redirect
def record_page():
    return render_template("index.html")


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
