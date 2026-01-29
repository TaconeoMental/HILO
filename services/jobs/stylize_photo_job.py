import os
import time

from logger import get_logger
from services import project_store, timeline, quotas
from services.image_stylize import stylize_image


log = get_logger("stylize_photo")


def stylize_photo_job(project_id, photo_id):
    state = project_store.load_state(project_id) or {}
    user_id = state.get("user_id")
    quota_used = False
    if user_id:
        ok, error = quotas.reserve_stylize_quota(user_id, reason="photo_stylize")
        if not ok:
            log.warning("Cuota de estilizado no disponible: %s", error)
            return
        quota_used = True

    photos = timeline.get_photos(project_id)
    target = next((p for p in photos if p["photo_id"] == photo_id), None)
    if not target:
        log.warning("Foto %s no encontrada", photo_id)
        if quota_used and user_id:
            quotas.release_stylize_quota(user_id)
        return

    original_path = target.get("original_path")
    if not original_path or not os.path.exists(original_path):
        log.warning("Foto %s sin archivo original", photo_id)
        if quota_used and user_id:
            quotas.release_stylize_quota(user_id)
        return

    project_dir = project_store.get_project_dir(project_id)
    stylized_path = os.path.join(project_dir, "photos", f"stylized_{photo_id}.jpg")

    start = time.time()
    success = stylize_image(original_path, stylized_path)
    elapsed = time.time() - start

    if not success:
        log.error("Falló estilizado de %s", photo_id)
        if quota_used and user_id:
            quotas.release_stylize_quota(user_id)
        return

    timeline.update_photo_stylized(project_id, photo_id, stylized_path)
    progress = state.get("progress", {})
    progress["photos_done"] = progress.get("photos_done", 0) + 1
    state["progress"] = progress
    project_store.save_state(project_id, state)
    log.info("Foto %s estilizada en %.2fs", photo_id, elapsed)
