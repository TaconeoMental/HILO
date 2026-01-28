import os
import time
from concurrent.futures import (
    ProcessPoolExecutor,
    ThreadPoolExecutor,
    TimeoutError,
    as_completed
)

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


def transcribe_chunk_worker(chunk_data):
    try:
        from services.stt_whisper import transcribe_wav

        wav_path = chunk_data.get("wav_path")
        index = chunk_data.get("index", 0)

        if not wav_path or not os.path.exists(wav_path):
            return index, "", 0.0

        start = time.time()
        text = transcribe_wav(wav_path)
        elapsed = time.time() - start

        return index, text, elapsed
    except Exception as exc:
        log.error(f"Error transcribiendo chunk {chunk_data.get('index')}: {exc}")
        return chunk_data.get("index", 0), "[Error en transcripción]", 0.0


def stylize_photo_worker(photo_data):
    photo_id = photo_data.get("photo_id")
    original_path = photo_data.get("original_path")
    stylized_path = photo_data.get("stylized_path")

    if not original_path or not os.path.exists(original_path):
        return photo_id, False, None, 0.0

    start = time.time()
    success = stylize_image(original_path, stylized_path)
    elapsed = time.time() - start

    return photo_id, success, stylized_path if success else None, elapsed


def transcribe_chunks_parallel(chunks, max_workers):
    pending = [c for c in chunks if not c.get("text") and c.get("wav_path")]
    if not pending:
        return chunks, []

    metrics = []
    timeout_seconds = Config.TRANSCRIBE_CHUNK_TIMEOUT

    log.info(
        f"Transcribiendo {len(pending)} chunks con {max_workers} workers"
    )

    try:
        with ProcessPoolExecutor(max_workers=max_workers or 1) as executor:
            future_map = {
                executor.submit(transcribe_chunk_worker, chunk): chunk
                for chunk in pending
            }

            for future in as_completed(future_map):
                chunk = future_map[future]
                index = chunk.get("index", 0)

                try:
                    idx, text, elapsed = future.result(timeout=timeout_seconds)
                    for c in chunks:
                        if c.get("index") == idx:
                            c["text"] = text
                            break
                    metrics.append({
                        "chunk_index": idx,
                        "time": elapsed,
                        "success": text != "[Error en transcripción]"
                    })
                except TimeoutError:
                    log.error(f"Timeout transcribiendo chunk {index}")
                    metrics.append({
                        "chunk_index": index,
                        "time": timeout_seconds,
                        "success": False
                    })
                    for c in chunks:
                        if c.get("index") == index:
                            c["text"] = "[Timeout en transcripción]"
                            break
                except Exception as exc:
                    log.error(f"Error procesando chunk {index}: {exc}")
                    metrics.append({
                        "chunk_index": index,
                        "time": 0.0,
                        "success": False
                    })
    except Exception as exc:
        log.warning(f"Procesamiento paralelo falló ({exc}), usando modo secuencial")
        metrics.clear()
        for chunk in pending:
            index = chunk.get("index", 0)
            try:
                idx, text, elapsed = transcribe_chunk_worker(chunk)
                for c in chunks:
                    if c.get("index") == idx:
                        c["text"] = text
                        break
                metrics.append({
                    "chunk_index": idx,
                    "time": elapsed,
                    "success": text != "[Error en transcripción]"
                })
            except Exception as inner_exc:
                log.error(f"Error secuencial en chunk {index}: {inner_exc}")
                for c in chunks:
                    if c.get("index") == index:
                        c["text"] = "[Error en transcripción]"
                        break
                metrics.append({
                    "chunk_index": index,
                    "time": 0.0,
                    "success": False
                })

    return chunks, metrics


def stylize_photos_parallel(photos, project_id, project_dir, user_id, max_workers):
    targets = []
    stylize_errors = 0
    stylize_attempts = 0
    metrics = []

    for photo in photos:
        if photo.get("stylized_path") or not photo.get("original_path"):
            continue

        quota_used = False
        if user_id:
            reserve_ok, _error = quotas.reserve_stylize_quota(
                user_id,
                reason="photo_stylize"
            )
            if not reserve_ok:
                stylize_errors += 1
                continue
            quota_used = True

        payload = {
            "photo_id": photo["photo_id"],
            "original_path": photo["original_path"],
            "stylized_path": os.path.join(
                project_dir,
                "photos",
                f"stylized_{photo['photo_id']}.jpg"
            ),
            "quota_used": quota_used
        }
        targets.append(payload)

    if not targets:
        return stylize_errors, stylize_attempts, metrics

    log.info(
        f"Proyecto {project_id}: estilizando {len(targets)} fotos con {max_workers} workers"
    )

    timeout_seconds = Config.STYLIZE_PHOTO_TIMEOUT

    try:
        with ProcessPoolExecutor(max_workers=max_workers or 1) as executor:
            future_map = {
                executor.submit(stylize_photo_worker, payload): payload
                for payload in targets
            }

            for future in as_completed(future_map):
                payload = future_map[future]
                photo_id = payload["photo_id"]
                quota_used = payload["quota_used"]

                try:
                    pid, success, stylized_path, elapsed = future.result(
                        timeout=timeout_seconds
                    )
                    if quota_used:
                        stylize_attempts += 1

                    metrics.append({
                        "photo_id": pid,
                        "time": elapsed,
                        "success": success
                    })

                    if success and stylized_path:
                        timeline.update_photo_stylized(
                            project_id,
                            pid,
                            stylized_path
                        )
                        for photo in photos:
                            if photo["photo_id"] == pid:
                                photo["stylized_path"] = stylized_path
                                break
                    else:
                        stylize_errors += 1
                        if quota_used and user_id:
                            quotas.release_stylize_quota(user_id)
                except TimeoutError:
                    log.error(f"Timeout estilizando foto {photo_id}")
                    stylize_errors += 1
                    metrics.append({
                        "photo_id": photo_id,
                        "time": timeout_seconds,
                        "success": False
                    })
                    if payload["quota_used"] and user_id:
                        quotas.release_stylize_quota(user_id)
                except Exception as exc:
                    log.error(f"Error estilizando foto {photo_id}: {exc}")
                    stylize_errors += 1
                    metrics.append({
                        "photo_id": photo_id,
                        "time": 0.0,
                        "success": False
                    })
                    if payload["quota_used"] and user_id:
                        quotas.release_stylize_quota(user_id)
    except Exception as exc:
        log.warning(f"Estilizado paralelo falló ({exc}), usando modo secuencial")
        metrics.clear()
        for payload in targets:
            photo_id = payload["photo_id"]
            quota_used = payload["quota_used"]
            try:
                start = time.time()
                success = stylize_image(
                    payload["original_path"],
                    payload["stylized_path"]
                )
                elapsed = time.time() - start
                if quota_used:
                    stylize_attempts += 1

                metrics.append({
                    "photo_id": photo_id,
                    "time": elapsed,
                    "success": success
                })

                if success:
                    timeline.update_photo_stylized(
                        project_id,
                        photo_id,
                        payload["stylized_path"]
                    )
                    for photo in photos:
                        if photo["photo_id"] == photo_id:
                            photo["stylized_path"] = payload["stylized_path"]
                            break
                else:
                    stylize_errors += 1
                    if quota_used and user_id:
                        quotas.release_stylize_quota(user_id)
            except Exception as inner_exc:
                log.error(f"Error secuencial estilizando foto {photo_id}: {inner_exc}")
                stylize_errors += 1
                metrics.append({
                    "photo_id": photo_id,
                    "time": 0.0,
                    "success": False
                })
                if quota_used and user_id:
                    quotas.release_stylize_quota(user_id)

    return stylize_errors, stylize_attempts, metrics


def process_project(project_id):
    log.info(f"Procesando proyecto: {project_id}")

    project_store.update_project_status(
        project_id,
        "processing",
        error_message=None,
        stylize_errors=0
    )

    metrics = {
        "start_time": time.time(),
        "transcription_metrics": [],
        "stylize_metrics": [],
        "chunks_total": 0,
        "chunks_processed": 0,
        "photos_total": 0,
        "photos_processed": 0,
        "photos_stylized": 0,
        "llm_time": 0.0
    }

    try:
        state = project_store.load_state(project_id)
        if not state:
            raise Exception("Proyecto no encontrado")

        participant_name = state.get("participant_name", "ACTOR")
        project_name = state.get("project_name", "Guion")
        should_stylize = state.get("stylize_photos", True)
        user_id = state.get("user_id")
        chunks = state.get("chunks", [])
        project_dir = project_store.get_project_dir(project_id)

        photos = timeline.get_photos(project_id)

        metrics["chunks_total"] = len(chunks)
        metrics["photos_total"] = len(photos)

        audio_workers = min(
            Config.TRANSCRIBE_PARALLEL_WORKERS,
            max(1, len([c for c in chunks if not c.get("text")]))
        )
        photo_workers = min(
            Config.STYLIZE_PARALLEL_WORKERS,
            max(1, len([p for p in photos if not p.get("stylized_path")]))
        ) if should_stylize else 0

        stylize_errors = 0
        stylize_attempts = 0

        with ThreadPoolExecutor(max_workers=2) as executor:
            audio_future = executor.submit(
                transcribe_chunks_parallel,
                chunks,
                audio_workers
            )

            photo_future = None
            if should_stylize and photos:
                photo_future = executor.submit(
                    stylize_photos_parallel,
                    photos,
                    project_id,
                    project_dir,
                    user_id,
                    photo_workers
                )

            chunks, transcription_metrics = audio_future.result()
            metrics["transcription_metrics"] = transcription_metrics
            metrics["chunks_processed"] = len(transcription_metrics)

            if photo_future:
                stylize_errors, stylize_attempts, stylize_metrics = (
                    photo_future.result()
                )
                metrics["stylize_metrics"] = stylize_metrics
                metrics["photos_processed"] = stylize_attempts
                metrics["photos_stylized"] = max(0, stylize_attempts - stylize_errors)
            else:
                metrics["stylize_metrics"] = []
                metrics["photos_processed"] = 0
                metrics["photos_stylized"] = 0

        transcript = " ".join(
            chunk.get("text", "") for chunk in chunks if chunk.get("text")
        )

        if should_stylize and stylize_errors > 0 and stylize_attempts:
            log.warning(
                f"Proyecto {project_id}: {stylize_errors} fotos sin estilizar"
            )
            if user_id:
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

        llm_start = time.time()
        transcript_with_markers = insert_photo_markers(
            transcript,
            photos,
            chunks
        )

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

        metrics["llm_time"] = time.time() - llm_start

        if should_stylize:
            for photo in photos:
                original_path = photo.get("original_path")
                stylized_path = photo.get("stylized_path")
                if stylized_path and original_path and os.path.exists(original_path):
                    try:
                        os.remove(original_path)
                    except OSError as exc:
                        log.warning(
                            f"No se pudo borrar original {original_path}: {exc}"
                        )

        metrics["total_time"] = time.time() - metrics["start_time"]

        if metrics["transcription_metrics"]:
            successful = [
                m["time"] for m in metrics["transcription_metrics"] if m["success"]
            ]
            metrics["avg_transcription_time"] = (
                sum(successful) / len(successful) if successful else 0.0
            )
        else:
            metrics["avg_transcription_time"] = 0.0

        if metrics["stylize_metrics"]:
            successful = [
                m["time"] for m in metrics["stylize_metrics"] if m["success"]
            ]
            metrics["avg_stylize_time"] = (
                sum(successful) / len(successful) if successful else 0.0
            )
        else:
            metrics["avg_stylize_time"] = 0.0

        project_store.update_state_fields(project_id, {
            "processing_metrics": metrics,
            "transcript": transcript
        })

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
            stylize_errors=stylize_errors if should_stylize else 0,
            llm_prompt_tokens=llm_prompt_tokens,
            llm_completion_tokens=llm_completion_tokens,
            llm_total_tokens=llm_total_tokens
        )

        if user_id:
            duration_seconds = state.get("recording_duration_seconds")
            if duration_seconds:
                quotas.consume_recording_seconds(user_id, int(duration_seconds))

        log.info(
            f"Proyecto {project_id} completado exitosamente en {metrics['total_time']:.2f}s"
        )
    except Exception as exc:
        log.error(f"Proyecto {project_id} falló: {exc}")
        project_store.update_project_status(
            project_id,
            "error",
            error_message=str(exc)
        )
