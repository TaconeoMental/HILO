import os
import time

from logger import get_logger
from services import project_store, timeline, quotas
from services.llm_service import (
    generate_script_with_usage,
    replace_markers_with_images
)


log = get_logger("finalize_project")


def finalize_project_job(project_id):
    state = project_store.load_state(project_id)
    if not state:
        raise RuntimeError("Proyecto no encontrado")

    segments = state.get("segments", {})
    if not segments:
        raise RuntimeError("Sin segmentos para procesar")

    ordered_segments = sorted(
        segments.values(),
        key=lambda s: s.get("start_ms", 0)
    )

    transcript = " ".join(
        seg.get("text", "") for seg in ordered_segments if seg.get("text")
    ).strip()

    photos = timeline.get_photos(project_id)
    transcript_with_markers = _insert_photo_markers(ordered_segments, photos)

    project_dir = project_store.get_project_dir(project_id)
    fallback_path = os.path.join(project_dir, "transcript_raw.txt")
    with open(fallback_path, "w", encoding="utf-8") as fh:
        fh.write(transcript_with_markers)

    participant_name = state.get("participant_name", "ACTOR")
    project_name = state.get("project_name", "Guion")

    llm_start = time.time()
    script, usage = generate_script_with_usage(
        transcript_with_markers,
        participant_name
    )
    llm_time = time.time() - llm_start

    final_script = replace_markers_with_images(script, photos)
    output_path = os.path.join(project_dir, "script.md")
    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(f"# {project_name}\n\n")
        fh.write(f"**Participante:** {participant_name}\n\n")
        fh.write("---\n\n")
        fh.write(final_script)

    metrics = _build_metrics(ordered_segments, photos, llm_time)
    state["processing_metrics"] = metrics
    state["transcript"] = transcript
    project_store.save_state(project_id, state)

    project_store.update_project_status(
        project_id,
        "done",
        output_file="script.md",
        fallback_file="transcript_raw.txt",
        stylize_errors=max(0, metrics.get("photos_total", 0) - metrics.get("photos_processed", 0)),
        llm_prompt_tokens=(usage or {}).get("prompt_tokens"),
        llm_completion_tokens=(usage or {}).get("completion_tokens"),
        llm_total_tokens=(usage or {}).get("total_tokens"),
        llm_cost_usd=None
    )

    user_id = state.get("user_id")
    duration_seconds = state.get("recording_duration_seconds")
    if user_id and duration_seconds:
        quotas.consume_recording_seconds(user_id, int(duration_seconds))

    log.info("Proyecto %s finalizado", project_id)


def _insert_photo_markers(segments, photos):
    parts = []
    sorted_photos = sorted(photos, key=lambda p: p.get("t_ms", 0))
    photo_index = 0
    total_photos = len(sorted_photos)

    for segment in segments:
        text = segment.get("text", "")
        if text:
            parts.append(text)

        segment_end = segment.get("end_ms", 0)
        while photo_index < total_photos and sorted_photos[photo_index].get("t_ms", 0) <= segment_end:
            photo_id = sorted_photos[photo_index]["photo_id"]
            parts.append(f" [[FOTO:{photo_id}]] ")
            photo_index += 1

    while photo_index < total_photos:
        parts.append(f" [[FOTO:{sorted_photos[photo_index]['photo_id']}]] ")
        photo_index += 1

    return "".join(parts).strip()


def _build_metrics(segments, photos, llm_time):
    metrics = {
        "chunks_total": len(segments),
        "chunks_processed": len(segments),
        "photos_total": len(photos),
        "photos_processed": len([p for p in photos if p.get("stylized_path")]),
        "llm_time": llm_time,
        "total_time": llm_time,
        "transcription_metrics": [],
        "stylize_metrics": []
    }

    total_transcription_time = 0.0
    successes = 0
    for segment in segments:
        elapsed = segment.get("transcription_time", 0.0)
        metrics["transcription_metrics"].append({
            "segment_id": segment.get("segment_id"),
            "time": elapsed,
            "success": bool(segment.get("text"))
        })
        if segment.get("text"):
            successes += 1
            total_transcription_time += elapsed

    metrics["avg_transcription_time"] = (
        total_transcription_time / successes if successes else 0.0
    )
    metrics["total_time"] += total_transcription_time
    metrics["avg_stylize_time"] = 0.0
    return metrics
