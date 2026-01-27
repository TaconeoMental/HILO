import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from logger import get_logger
from config import Config
from services import project_store, timeline, quotas
from services.llm_service import (
    insert_photo_markers,
    generate_script_with_usage,
    replace_markers_with_images
)
from services.image_stylize import stylize_image
from extensions import Session
from models import log_audit

log = get_logger("job")


def _stylize_single_photo(photo, project_id, project_dir, user_id):
    # Thread-safe.
    photo_id = photo["photo_id"]
    original = photo.get("original_path")

    if not original or not os.path.exists(original):
        return (photo_id, False, None, False)

    # Reservar cuota (cada thread tiene su propia sesion DB)
    quota_reserved = False
    if user_id:
        reserve_ok, _error = quotas.reserve_stylize_quota(
            user_id,
            reason="photo_stylize"
        )
        if not reserve_ok:
            return (photo_id, False, None, False)
        quota_reserved = True

    stylized_name = f"stylized_{photo_id}.jpg"
    stylized_path = os.path.join(project_dir, "photos", stylized_name)

    success = stylize_image(original, stylized_path)

    if not success and quota_reserved and user_id:
        quotas.release_stylize_quota(user_id)

    return (photo_id, success, stylized_path if success else None, quota_reserved)


def process_project(project_id):
    log.info(f"Procesando proyecto: {project_id}")

    project_store.update_project_status(
        project_id,
        "processing",
        error_message=None,
        stylize_errors=0
    )

    try:
        state = project_store.load_state(project_id)
        if not state:
            raise Exception("Proyecto no encontrado")

        participant_name = state.get("participant_name", "ACTOR")
        project_name = state.get("project_name", "Guion")
        should_stylize = state.get("stylize_photos", True)
        user_id = state.get("user_id")
        chunks = state.get("chunks", [])
        raw_transcript = state.get("transcript", "")

        t_len = len(raw_transcript)
        log.info(f"Proyecto {project_id}: transcript {t_len} chars, {len(chunks)} chunks")

        project_dir = project_store.get_project_dir(project_id)

        project_store.update_project_status(
            project_id,
            "processing",
            fallback_file="transcript_raw.txt"
        )

        photos = timeline.get_photos(project_id)
        stylize_errors = 0
        stylize_attempts = 0

        if should_stylize:
            # Filtrar fotos que necesitan estilización
            photos_to_stylize = [
                p for p in photos
                if not p.get("stylized_path") and p.get("original_path")
            ]

            if photos_to_stylize:
                max_workers = min(
                    Config.STYLIZE_PARALLEL_WORKERS,
                    len(photos_to_stylize)
                )
                log.info(
                    f"Proyecto {project_id}: estilizando {len(photos_to_stylize)} "
                    f"fotos con {max_workers} workers"
                )

                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = {
                        executor.submit(
                            _stylize_single_photo,
                            photo,
                            project_id,
                            project_dir,
                            user_id
                        ): photo
                        for photo in photos_to_stylize
                    }

                    for future in as_completed(futures):
                        photo = futures[future]
                        try:
                            photo_id, success, stylized_path, quota_used = (
                                future.result()
                            )
                            if quota_used:
                                stylize_attempts += 1
                            if success and stylized_path:
                                timeline.update_photo_stylized(
                                    project_id,
                                    photo_id,
                                    stylized_path
                                )
                                photo["stylized_path"] = stylized_path
                            elif quota_used:
                                stylize_errors += 1
                        except Exception as e:
                            log.error(f"Error procesando foto: {e}")
                            stylize_errors += 1

            if stylize_errors > 0:
                log.warning(
                    f"Proyecto {project_id}: {stylize_errors} fotos sin estilizar"
                )
                if user_id and stylize_attempts:
                    db = Session()
                    try:
                        log_audit(
                            db,
                            action="photo_stylize_failed",
                            actor_user_id=user_id,
                            target_user_id=user_id,
                            details={
                                "project_id": project_id,
                                "failed_count": stylize_errors,
                                "attempted_count": stylize_attempts,
                                "total_photos": len(photos)
                            }
                        )
                        db.commit()
                    finally:
                        Session.remove()
        else:
            log.info(f"Proyecto {project_id}: Estilización desactivada")

        transcript_with_markers = insert_photo_markers(
            raw_transcript,
            photos,
            chunks
        )

        # Guardar transcripción con marcadores para debug/fallback
        fallback_path = os.path.join(project_dir, "transcript_raw.txt")
        with open(fallback_path, "w", encoding="utf-8") as f:
            f.write(transcript_with_markers)

        script, usage = generate_script_with_usage(
            transcript_with_markers,
            participant_name
        )

        final_script = replace_markers_with_images(script, photos)

        output_path = os.path.join(project_dir, "script.md")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"# {project_name}\n\n")
            f.write(f"**Participante:** {participant_name}\n\n")
            f.write("---\n\n")
            f.write(final_script)

        if should_stylize:
            for photo in photos:
                original_path = photo.get("original_path")
                stylized_path = photo.get("stylized_path")
                if not stylized_path or not original_path:
                    continue
                if os.path.exists(original_path):
                    try:
                        os.remove(original_path)
                    except OSError as e:
                        log.warning(
                            f"No se pudo borrar original {original_path}: {e}"
                        )

        llm_prompt_tokens = None
        llm_completion_tokens = None
        llm_total_tokens = None
        if usage:
            llm_prompt_tokens = usage.get("prompt_tokens")
            llm_completion_tokens = usage.get("completion_tokens")
            llm_total_tokens = usage.get("total_tokens")

        project_store.update_project_status(
            project_id,
            "done",
            output_file="script.md",
            stylize_errors=stylize_errors,
            llm_prompt_tokens=llm_prompt_tokens,
            llm_completion_tokens=llm_completion_tokens,
            llm_total_tokens=llm_total_tokens
        )

        if user_id:
            duration_seconds = state.get("recording_duration_seconds")
            if duration_seconds:
                quotas.consume_recording_seconds(
                    user_id,
                    int(duration_seconds)
                )

        log.info(f"Proyecto {project_id} completado exitosamente")
    except Exception as e:
        log.error(f"Proyecto {project_id} falló: {e}")
        project_store.update_project_status(
            project_id,
            "error",
            error_message=str(e)
        )
