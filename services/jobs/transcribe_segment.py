import os
import time

from logger import get_logger
from services import project_store
from services.stt_service import transcribe_wav


log = get_logger("transcribe_segment")


def transcribe_segment_job(project_id, segment_id):
    segment = project_store.get_segment(project_id, segment_id)
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

    project_store.update_segment_text(project_id, segment_id, text, elapsed)
    log.info("Segmento %s transcrito en %.2fs", segment_id, elapsed)
