import os
import time

from logger import get_logger
from services import project_store
from services.stt_service import transcribe_wav


log = get_logger("transcribe_segment")


def transcribe_segment_job(project_id, segment_id):
    state = project_store.load_state(project_id)
    if not state:
        log.error("Proyecto %s no encontrado", project_id)
        return

    segment = (state.get("segments") or {}).get(segment_id)
    if not segment:
        log.error("Segmento %s no encontrado", segment_id)
        return

    project_dir = project_store.get_project_dir(project_id)
    wav_path = os.path.join(project_dir, segment["wav_path"])
    start = time.time()
    text = transcribe_wav(wav_path)
    elapsed = time.time() - start

    text_path = os.path.join(project_dir, segment.get("text_path", ""))
    if text_path:
        with open(text_path, "w", encoding="utf-8") as fh:
            fh.write(text)

    segment["text"] = text
    segment["transcription_time"] = elapsed
    segment["status"] = "done"

    segments = state.get("segments", {})
    segments[segment_id] = segment

    progress = state.get("progress", {})
    progress["segments_done"] = progress.get("segments_done", 0) + 1
    state["progress"] = progress
    state["segments"] = segments
    project_store.save_state(project_id, state)
    log.info("Segmento %s transcrito en %.2fs", segment_id, elapsed)
