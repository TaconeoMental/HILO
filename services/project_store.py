"""
No estoy orgulloso de este archivo
"""
import os
import json
import uuid
import shutil
import threading
from datetime import datetime, timedelta, timezone

from config import Config
from extensions import Session
from logger import get_logger
from models import Project, ProjectEvent, utcnow
from services import timeline

log = get_logger("project")

_lock = threading.Lock()


def is_valid_project_id(project_id):
    if not project_id or not isinstance(project_id, str):
        return False

    try:
        uuid.UUID(project_id)
    except ValueError:
        return False

    data_dir = os.path.realpath(os.path.join(Config.DATA_DIR, "projects"))
    project_dir = os.path.realpath(os.path.join(data_dir, project_id))

    if not project_dir.startswith(data_dir + os.sep):
        return False

    if not os.path.isdir(project_dir):
        return False
    return True


def _to_uuid(value):
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def get_project_record(project_id):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None

    db = Session()
    try:
        return db.query(Project).filter_by(id=project_uuid).first()
    finally:
        Session.remove()


def get_project_for_user(project_id, user_id):
    project_uuid = _to_uuid(project_id)
    user_uuid = _to_uuid(user_id)
    if not project_uuid or not user_uuid:
        return None

    db = Session()
    try:
        return db.query(Project).filter_by(
            id=project_uuid,
            user_id=user_uuid
        ).first()
    finally:
        Session.remove()


def user_owns_project(project_id, user_id):
    return get_project_for_user(project_id, user_id) is not None


def create_project(
    user_id,
    project_name="",
    participant_name="",
    quota_reserved=False
):
    user_uuid = _to_uuid(user_id)
    if not user_uuid:
        raise ValueError("user_id inválido")

    project_id = str(uuid.uuid4())
    project_dir = os.path.join(Config.DATA_DIR, "projects", project_id)
    audio_chunks_dir = os.path.join(project_dir, "audio_chunks")
    wav_chunks_dir = os.path.join(project_dir, "wav_chunks")
    photos_dir = os.path.join(project_dir, "photos")

    os.makedirs(audio_chunks_dir, exist_ok=True)
    os.makedirs(wav_chunks_dir, exist_ok=True)
    os.makedirs(photos_dir, exist_ok=True)

    expires_at = utcnow() + timedelta(days=Config.RETENTION_DAYS)

    recording_started_at = utcnow().isoformat()

    state = {
        "project_id": project_id,
        "user_id": str(user_uuid),
        "project_name": project_name,
        "participant_name": participant_name,
        "stylize_photos": True,
        "created_at": recording_started_at,
        "recording_started_at": recording_started_at,
        "recording_limit_seconds": None,
        "chunk_duration_seconds": Config.AUDIO_CHUNK_SECONDS,
        "expires_at": expires_at.isoformat(),
        "stopped_at": None,
        "quota_reserved": quota_reserved,
        "ingest": {
            "chunks": [],
            "duration_ms": 0,
            "bytes_total": 0,
            "last_seq": -1
        },
        "segments": {},
        "processing_jobs": {},
        "progress": {
            "segments_total": 0,
            "segments_done": 0,
            "photos_total": 0,
            "photos_done": 0
        },
        "transcript": ""
    }

    save_state(project_id, state)

    db = Session()
    try:
        project = Project(
            id=uuid.UUID(project_id),
            user_id=user_uuid,
            title=project_name or "Sin título",
            status="recording",
            expires_at=expires_at
        )
        db.add(project)
        db.add(ProjectEvent(project_id=project.id, user_id=user_uuid))
        db.commit()
    finally:
        Session.remove()

    log.info(f"Proyecto creado: {project_id}")
    return project_id


def get_project_dir(project_id):
    return os.path.join(Config.DATA_DIR, "projects", project_id)


def get_state_path(project_id):
    return os.path.join(get_project_dir(project_id), "state.json")


def load_state(project_id):
    state_path = get_state_path(project_id)
    if not os.path.exists(state_path):
        return None
    with _lock:
        with open(state_path, "r", encoding="utf-8") as f:
            return json.load(f)


def save_state(project_id, state):
    state_path = get_state_path(project_id)
    with _lock:
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)


def is_project_stopped(project_id):
    state = load_state(project_id)
    if not state:
        return True
    return state.get("stopped_at") is not None


def is_project_active(project_id):
    if not is_valid_project_id(project_id):
        return False
    return not is_project_stopped(project_id)


def mark_stopped(project_id):
    state = load_state(project_id)
    if state:
        state["stopped_at"] = datetime.utcnow().isoformat()
        save_state(project_id, state)
        log.info(f"Proyecto detenido: {project_id}")
    return state


def update_state_fields(project_id, updates):
    state = load_state(project_id)
    if not state:
        return None
    state.update(updates)
    save_state(project_id, state)
    return state


def _init_ingest(state):
    ingest = state.get("ingest")
    if not ingest:
        ingest = {
            "chunks": [],
            "duration_ms": 0,
            "bytes_total": 0,
            "last_seq": -1
        }
        state["ingest"] = ingest
    return ingest


def append_ingest_chunk(project_id, chunk_entry):
    state = load_state(project_id)
    if not state:
        raise ValueError("Proyecto no encontrado")

    ingest = _init_ingest(state)
    ingest.setdefault("chunks", []).append(chunk_entry)
    ingest["chunks"].sort(key=lambda c: c.get("seq", 0))
    end_ms = chunk_entry.get("start_ms", 0) + chunk_entry.get("duration_ms", 0)
    ingest["duration_ms"] = max(ingest.get("duration_ms", 0), end_ms)
    ingest["bytes_total"] = ingest.get("bytes_total", 0) + chunk_entry.get("bytes", 0)
    ingest["last_seq"] = max(ingest.get("last_seq", -1), chunk_entry.get("seq", 0))
    save_state(project_id, state)
    return ingest


def get_ingest_data(project_id):
    state = load_state(project_id)
    if not state:
        return {}
    return state.get("ingest", {})


def set_processing_jobs(project_id, jobs_dict):
    state = load_state(project_id)
    if not state:
        return None
    state["processing_jobs"] = jobs_dict
    save_state(project_id, state)
    return state


def update_processing_jobs(project_id, updates):
    state = load_state(project_id)
    if not state:
        return None
    jobs = state.get("processing_jobs", {})
    jobs.update(updates)
    state["processing_jobs"] = jobs
    save_state(project_id, state)
    return jobs


def _parse_state_datetime(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def get_recording_elapsed_seconds(project_id):
    state = load_state(project_id)
    if not state:
        return None
    started_at = _parse_state_datetime(
        state.get("recording_started_at") or state.get("created_at")
    )
    if not started_at:
        return None
    elapsed = utcnow() - started_at
    return max(0, int(elapsed.total_seconds()))


def is_recording_limit_exceeded(project_id):
    state = load_state(project_id)
    if not state:
        return False
    limit_seconds = state.get("recording_limit_seconds")
    if not limit_seconds:
        return False
    elapsed_seconds = get_recording_elapsed_seconds(project_id)
    if elapsed_seconds is None:
        return False
    return elapsed_seconds >= int(limit_seconds)


def is_quota_reserved(project_id):
    state = load_state(project_id)
    if not state:
        return False
    return bool(state.get("quota_reserved"))


def set_quota_reserved(project_id, reserved=True):
    state = load_state(project_id)
    if not state:
        return None
    state["quota_reserved"] = bool(reserved)
    save_state(project_id, state)
    return state


def project_exists(project_id):
    if not is_valid_project_id(project_id):
        return False
    return get_project_record(project_id) is not None


def update_project_status(
    project_id,
    status,
    job_id=None,
    output_file=None,
    fallback_file=None,
    error_message=None,
    stylize_errors=None,
    llm_prompt_tokens=None,
    llm_completion_tokens=None,
    llm_total_tokens=None,
    llm_cost_usd=None
):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return False

    db = Session()
    try:
        project = db.query(Project).filter_by(id=project_uuid).first()
        if not project:
            return False

        project.status = status
        if job_id is not None:
            project.job_id = _to_uuid(job_id)
        if output_file is not None:
            project.output_file = output_file
        if fallback_file is not None:
            project.fallback_file = fallback_file
        if error_message is not None:
            project.error_message = error_message
        if stylize_errors is not None:
            project.stylize_errors = stylize_errors
        if llm_prompt_tokens is not None:
            project.llm_prompt_tokens = llm_prompt_tokens
        if llm_completion_tokens is not None:
            project.llm_completion_tokens = llm_completion_tokens
        if llm_total_tokens is not None:
            project.llm_total_tokens = llm_total_tokens
        if llm_cost_usd is not None:
            project.llm_cost_usd = llm_cost_usd

        db.commit()
        return True
    finally:
        Session.remove()


def delete_project(project_id):
    if not is_valid_project_id(project_id):
        raise ValueError("Invalid project_id")

    project_uuid = _to_uuid(project_id)
    if project_uuid:
        db = Session()
        try:
            project_record = db.query(Project).filter_by(id=project_uuid).first()
            if project_record:
                db.delete(project_record)
                db.commit()
        finally:
            Session.remove()

    shutil.rmtree(get_project_dir(project_id))
    log.info(f"Proyecto eliminado: {project_id}")
    return True


def list_projects(user_id, limit=10, offset=0, query=None, status=None):
    user_uuid = _to_uuid(user_id)
    if not user_uuid:
        return [], 0

    db = Session()
    try:
        base_query = db.query(Project).filter_by(user_id=user_uuid)
        if status:
            base_query = base_query.filter_by(status=status)
        if query:
            like_query = f"%{query}%"
            base_query = base_query.filter(Project.title.ilike(like_query))
        records = base_query.order_by(Project.created_at.desc()).all()
    finally:
        Session.remove()

    projects = []
    query_normalized = query.lower() if query else None

    for record in records:
        project_id = str(record.id)
        state = load_state(project_id) or {}

        photos = timeline.get_photos(project_id)
        photo_count = len(photos)

        created_at = state.get("created_at")
        if not created_at and record.created_at:
            created_at = record.created_at.isoformat()

        project_status = record.status
        job_status = None
        if project_status in {"queued", "processing", "done", "error"}:
            job_status = project_status

        project_name = state.get("project_name", record.title or "Sin título")
        participant_name = state.get("participant_name", "")

        if query_normalized:
            name_match = query_normalized in project_name.lower()
            participant_match = query_normalized in participant_name.lower()
            if not (name_match or participant_match):
                continue

        projects.append({
            "project_id": project_id,
            "project_name": project_name,
            "participant_name": participant_name,
            "created_at": created_at,
            "expires_at": record.expires_at.isoformat() if record.expires_at else None,
            "status": project_status,
            "is_active": project_status == "recording",
            "job_status": job_status,
            "stylize_errors": record.stylize_errors or 0,
            "photo_count": photo_count,
            "recording_duration_seconds": state.get("recording_duration_seconds")
        })
    total = len(projects)
    start = max(0, int(offset))
    end = start + max(1, int(limit))
    return projects[start:end], total
