import os
import shutil
import subprocess

from rq import Retry, get_current_job

from config import Config
from logger import get_logger
from services import project_store, timeline
from services.queue import get_queue
from services.storage import get_audio_storage


log = get_logger("audio_prepare")


def prepare_project_job(project_id):
    log.info("Preparando proyecto %s", project_id)

    state = project_store.load_state(project_id)
    if not state:
        raise RuntimeError("Proyecto no encontrado")

    ingest = state.get("ingest", {})
    chunks = sorted(ingest.get("chunks", []), key=lambda c: c.get("seq", 0))
    if not chunks:
        raise RuntimeError("No hay chunks para procesar")

    project_dir = project_store.get_project_dir(project_id)
    audio_dir = os.path.join(project_dir, "audio")
    segments_dir = os.path.join(project_dir, "segments")
    os.makedirs(audio_dir, exist_ok=True)
    os.makedirs(segments_dir, exist_ok=True)

    storage = get_audio_storage()
    local_paths = []
    cleanup = []
    for chunk in chunks:
        path, is_temp = storage.ensure_local_file(project_id, chunk)
        absolute = os.path.abspath(path)
        local_paths.append(absolute)
        if is_temp:
            cleanup.append(absolute)

    full_wav = os.path.join(audio_dir, "full.wav")
    _build_wav_from_chunks(project_id, local_paths, full_wav)

    for temp in cleanup:
        try:
            os.remove(temp)
        except OSError:
            pass

    duration_ms = ingest.get("duration_ms", 0)
    photos = timeline.get_photos(project_id)
    segments = _slice_segments(full_wav, segments_dir, duration_ms, photos)

    project_store.replace_segments(project_id, segments)
    stylize_enabled = state.get("stylize_photos", True)
    project_store.update_state_fields(project_id, {
        "photos_total": len(photos) if stylize_enabled else 0,
        "photos_done": len([p for p in photos if p.get("stylized_path")])
    })

    current_job = get_current_job()
    retry_fast = Retry(max=2, interval=[10, 30])
    transcribe_queue = get_queue(Config.RQ_TRANSCRIBE_QUEUE)
    stylize_queue = get_queue(Config.RQ_PHOTO_QUEUE)
    finalize_queue = get_queue(Config.RQ_LLM_QUEUE)

    transcribe_jobs = []
    for segment_id in segments.keys():
        job = transcribe_queue.enqueue(
            "services.jobs.transcribe_segment.transcribe_segment_job",
            project_id,
            segment_id,
            job_timeout=Config.TRANSCRIBE_JOB_TIMEOUT,
            retry=retry_fast,
            depends_on=current_job
        )
        transcribe_jobs.append((segment_id, job))

    stylize_jobs = []
    if state.get("stylize_photos", True):
        for photo in photos:
            if photo.get("stylized_path"):
                continue
            job = stylize_queue.enqueue(
                "services.jobs.stylize_photo_job.stylize_photo_job",
                project_id,
                photo["photo_id"],
                job_timeout=Config.PHOTO_JOB_TIMEOUT,
                retry=retry_fast,
                depends_on=current_job
            )
            stylize_jobs.append((photo["photo_id"], job))

    depends = [job for _, job in transcribe_jobs]
    depends.extend(job for _, job in stylize_jobs)
    finalize_job = finalize_queue.enqueue(
        "services.jobs.finalize_project.finalize_project_job",
        project_id,
        depends_on=depends or current_job,
        job_timeout=Config.LLM_JOB_TIMEOUT,
        retry=Retry(max=1)
    )

    jobs_state = {
        "prepare": current_job.id if current_job else None,
        "transcribe": {seg_id: job.id for seg_id, job in transcribe_jobs},
        "photos": {photo_id: job.id for photo_id, job in stylize_jobs},
        "finalize": finalize_job.id
    }
    project_store.set_processing_jobs(project_id, jobs_state)
    project_store.update_project_status(project_id, status="processing", job_id=finalize_job.id)
    log.info(
        "Proyecto %s: %d segmentos, %d fotos encoladas",
        project_id,
        len(segments),
        len(stylize_jobs)
    )


def _build_wav_from_chunks(project_id, chunk_paths, output_path):
    output_dir = os.path.abspath(os.path.dirname(output_path))
    os.makedirs(output_dir, exist_ok=True)
    combined_path = os.path.join(output_dir, "combined.webm")
    total_bytes = 0
    with open(combined_path, "wb") as combined:
        for path in chunk_paths:
            with open(path, "rb") as src:
                shutil.copyfileobj(src, combined)
            total_bytes += os.path.getsize(path)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        combined_path,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        output_path
    ]
    subprocess.run(cmd, check=True)
    if Config.DEBUG_CONCAT_FILES:
        log.info(
            "Proyecto %s: combinado %s con %d chunks (%d bytes totales)",
            project_id,
            combined_path,
            len(chunk_paths),
            total_bytes
        )
    else:
        try:
            os.remove(combined_path)
        except OSError:
            pass


def _slice_segments(full_wav_path, segments_dir, duration_ms, photos):
    segments = {}
    markers = sorted(
        [int(p.get("t_ms", 0)) for p in photos if p.get("t_ms") is not None]
    )

    start = 0
    idx = 0
    for marker in markers:
        marker = max(0, min(marker, duration_ms))
        if marker > start:
            segment_id = f"seg_{idx:04d}"
            _extract_segment(full_wav_path, segments_dir, segment_id, start, marker)
            segments[segment_id] = _segment_entry(segment_id, start, marker)
            idx += 1
        start = marker

    if duration_ms > start:
        segment_id = f"seg_{idx:04d}"
        _extract_segment(full_wav_path, segments_dir, segment_id, start, duration_ms)
        segments[segment_id] = _segment_entry(segment_id, start, duration_ms)

    if not segments:
        raise RuntimeError("No se pudieron generar segmentos")

    return segments


def _extract_segment(source_wav, segments_dir, segment_id, start_ms, end_ms):
    out_path = os.path.join(segments_dir, f"{segment_id}.wav")
    start_sec = start_ms / 1000.0
    duration_sec = (end_ms - start_ms) / 1000.0
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_sec:.3f}",
        "-t",
        f"{duration_sec:.3f}",
        "-i",
        source_wav,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        out_path
    ]
    subprocess.run(cmd, check=True)


def _segment_entry(segment_id, start_ms, end_ms):
    return {
        "segment_id": segment_id,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "wav_path": os.path.join("segments", f"{segment_id}.wav"),
        "text_path": os.path.join("segments", f"{segment_id}.txt"),
        "status": "pending",
        "text": "",
        "transcription_time": 0.0
    }
