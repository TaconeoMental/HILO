import os
import re
import html as html_lib

from flask import Blueprint, jsonify, send_from_directory
from flask_login import login_required, current_user

from helpers import is_valid_uuid, encode_image_base64, get_mime_type
from models import utcnow
from services import project_store


jobs_bp = Blueprint('jobs', __name__)



@jobs_bp.route("/api/project/<project_id>/status")
@login_required
def project_status(project_id):
    if not is_valid_uuid(project_id):
        return jsonify({"ok": False, "error": "project_id inválido"}), 400

    record = project_store.get_project_for_user(project_id, current_user.id)
    if not record:
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    state = project_store.load_state(project_id) or {}
    return jsonify({
        "ok": True,
        "status": record.status,
        "error": record.error_message,
        "output_file": record.output_file,
        "fallback_file": record.fallback_file,
        "project_name": state.get("project_name", record.title),
        "participant_name": state.get("participant_name", ""),
        "progress": state.get("progress", {}),
        "processing_jobs": state.get("processing_jobs", {})
    })


@jobs_bp.route("/r/<project_id>/download/<filename>")
@login_required
def download_file(project_id, filename):
    if not is_valid_uuid(project_id):
        return "No encontrado", 404

    record = project_store.get_project_for_user(project_id, current_user.id)
    if not record:
        return "No encontrado", 404

    expires_at = record.expires_at
    if expires_at is not None and expires_at <= utcnow():
        return "Proyecto expirado", 410

    safe_filename = os.path.basename(filename)
    allowed = {record.output_file, record.fallback_file}
    if safe_filename not in allowed:
        return "No encontrado", 404

    project_dir = project_store.get_project_dir(project_id)
    file_path = os.path.join(project_dir, safe_filename)
    if not os.path.exists(file_path):
        return "File not found", 404

    mimetype = get_mime_type(safe_filename)

    return send_from_directory(
        project_dir,
        safe_filename,
        as_attachment=True,
        mimetype=mimetype
    )


@jobs_bp.route("/api/project/<project_id>/preview")
@login_required
def project_preview(project_id):
    if not is_valid_uuid(project_id):
        return jsonify({"ok": False, "error": "project_id inválido"}), 400

    record = project_store.get_project_for_user(project_id, current_user.id)
    if not record:
        return jsonify({"ok": False, "error": "Proyecto no encontrado"}), 404

    expires_at = record.expires_at
    if expires_at is not None and expires_at <= utcnow():
        return jsonify({"ok": False, "error": "Proyecto expirado"}), 410

    project_dir = project_store.get_project_dir(project_id)
    script_path = os.path.join(project_dir, "script.md")

    if not os.path.exists(script_path):
        return jsonify({"ok": False, "error": "script not found"}), 404

    try:
        with open(script_path, "r", encoding="utf-8") as f:
            content = f.read()

        html = convert_script_to_html(content, project_id)

        return jsonify({"ok": True, "html": html})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def convert_script_to_html(content, project_id):
    project_dir = project_store.get_project_dir(project_id)
    photos_dir = os.path.join(project_dir, "photos")
    content = content.strip()
    lines = content.split('\n')
    html_parts = []
    prev_empty = False

    for line in lines:
        if not line.strip():
            if not prev_empty:
                html_parts.append('<div style="height: 1em;"></div>')
            prev_empty = True
            continue
        prev_empty = False

        if line.startswith('# '):
            text = html_lib.escape(line[2:])
            html_parts.append(f'<h1 style="text-align: center; margin-bottom: 0.5em;">{text}</h1>')
            continue

        if line.startswith('## '):
            text = html_lib.escape(line[3:])
            html_parts.append(f'<h2 style="margin-top: 1em;">{text}</h2>')
            continue

        if line.strip() == '---':
            html_parts.append('<hr style="margin: 1em 0;">')
            continue

        if '**' in line:
            text = html_lib.escape(line)
            text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
            html_parts.append(f'<p style="margin: 0.5em 0;">{text}</p>')
            continue

        img_match = re.match(r'!\[(.+?)\]\((.+?)\)', line.strip())
        if img_match:
            alt = html_lib.escape(img_match.group(1))
            filename = os.path.basename(img_match.group(2))
            img_path = os.path.join(photos_dir, filename)

            real_photos_dir = os.path.realpath(photos_dir)
            real_img_path = os.path.realpath(img_path)
            if not real_img_path.startswith(real_photos_dir + os.sep):
                html_parts.append(f'<div style="text-align: center; margin: 1em 0; padding: 2em; background: #333; border-radius: 8px; color: #999;">[Ruta inválida]</div>')
                continue

            if os.path.exists(img_path):
                b64_data = encode_image_base64(img_path)
                mime = get_mime_type(filename) or 'image/jpeg'

                data_url = f'data:{mime};base64,{b64_data}'
                html_parts.append(f'<div style="text-align: center; margin: 1em 0;"><img src="{data_url}" alt="{alt}" style="max-width: 40%; border-radius: 8px;"></div>')
            else:
                html_parts.append(f'<div style="text-align: center; margin: 1em 0; padding: 2em; background: #333; border-radius: 8px; color: #999;">[Imagen no encontrada: {alt}]</div>')
            continue

        text = html_lib.escape(line)
        leading_spaces = len(line) - len(line.lstrip())
        if leading_spaces > 0:
            nbsp = '&nbsp;' * leading_spaces
            text = nbsp + text.lstrip()

        html_parts.append(f'<div style="margin: 0; white-space: pre-wrap;">{text}</div>')

    return '\n'.join(html_parts)
