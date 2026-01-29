import json
import os
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import cast

from sqlalchemy import update, func

from config import Config
from extensions import Session
from logger import get_logger
from models import (
    Project,
    ProjectEvent,
    ProjectState,
    ProjectSegment,
    ProjectIngestChunk,
    ProjectPhoto,
    utcnow
)
from services.cache import get_redis_client


log = get_logger("project_state")
_redis = get_redis_client()


def _to_uuid(value):
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _state_cache_key(project_id):
    return f"project_state:{project_id}"


def _invalidate_cache(project_id):
    try:
        _redis.delete(_state_cache_key(project_id))
    except Exception:
        pass


def invalidate_cache(project_id):
    _invalidate_cache(project_id)


def _as_float(value):
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def get_project_dir(project_id):
    return os.path.join(Config.DATA_DIR, "projects", project_id)


def project_exists(project_id):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return False
    session = Session()
    try:
        exists = session.query(Project.id).filter_by(id=project_uuid).first() is not None
        return exists
    finally:
        Session.remove()


def get_project_record(project_id):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None
    session = Session()
    try:
        return session.query(Project).filter_by(id=project_uuid).first()
    finally:
        Session.remove()


def get_project_for_user(project_id, user_id):
    project_uuid = _to_uuid(project_id)
    user_uuid = _to_uuid(user_id)
    if not project_uuid or not user_uuid:
        return None
    session = Session()
    try:
        return (
            session.query(Project)
            .filter_by(id=project_uuid, user_id=user_uuid)
            .first()
        )
    finally:
        Session.remove()


def user_owns_project(project_id, user_id):
    return get_project_for_user(project_id, user_id) is not None


def create_project(user_id, project_name="", participant_name="", quota_reserved=False):
    user_uuid = _to_uuid(user_id)
    if not user_uuid:
        raise ValueError("user_id inválido")

    project_id = str(uuid.uuid4())
    project_uuid = uuid.UUID(project_id)

    project_dir = get_project_dir(project_id)
    os.makedirs(project_dir, exist_ok=True)
    os.makedirs(os.path.join(project_dir, "audio_chunks"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "wav_chunks"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "photos"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "segments"), exist_ok=True)

    expires_at = utcnow() + timedelta(days=Config.RETENTION_DAYS)
    recording_started_at = utcnow()

    session = Session()
    try:
        project = Project(
            id=project_uuid,
            user_id=user_uuid,
            title=project_name or "Sin título",
            status="recording",
            expires_at=expires_at
        )
        session.add(project)

        state = ProjectState(
            project_id=project_uuid,
            participant_name=participant_name,
            stylize_photos=True,
            recording_started_at=recording_started_at,
            chunk_duration_seconds=Config.AUDIO_CHUNK_SECONDS,
            expires_at=expires_at,
            quota_reserved=quota_reserved
        )
        session.add(state)
        session.add(ProjectEvent(project_id=project_uuid, user_id=user_uuid))
        session.commit()
    finally:
        Session.remove()

    log.info("Proyecto creado: %s", project_id)
    return project_id


def _fetch_state_rows(session, project_uuid):
    state = session.query(ProjectState).filter_by(project_id=project_uuid).first()
    if not state:
        return None, None, [], []
    project_row = session.query(Project).filter_by(id=project_uuid).first()
    chunks = (
        session.query(ProjectIngestChunk)
        .filter_by(project_id=project_uuid)
        .order_by(ProjectIngestChunk.seq.asc())
        .all()
    )
    segments = (
        session.query(ProjectSegment)
        .filter_by(project_id=project_uuid)
        .order_by(ProjectSegment.start_ms.asc())
        .all()
    )
    return state, project_row, chunks, segments


def _build_state_dict(state_row, project_row, chunks, segments):
    ingest = {
        "chunks": [
            {
                "seq": chunk.seq,
                "start_ms": chunk.start_ms,
                "duration_ms": chunk.duration_ms,
                "bytes": chunk.bytes,
                "storage": chunk.storage_backend,
                "path": chunk.storage_path
            }
            for chunk in chunks
        ],
        "duration_ms": state_row.ingest_duration_ms,
        "bytes_total": state_row.ingest_bytes_total,
        "last_seq": state_row.last_seq
    }

    segments_dict = {}
    for seg in segments:
        transcription_value = getattr(seg, "transcription_time")
        segments_dict[seg.segment_id] = {
            "segment_id": seg.segment_id,
            "start_ms": seg.start_ms,
            "end_ms": seg.end_ms,
            "wav_path": seg.wav_path,
            "text_path": seg.text_path,
            "status": seg.status,
            "text": seg.text or "",
            "transcription_time": _as_float(transcription_value)
        }

    data = {
        "project_id": str(state_row.project_id),
        "user_id": str(project_row.user_id) if project_row else None,
        "project_name": project_row.title if project_row else "",
        "participant_name": state_row.participant_name,
        "stylize_photos": state_row.stylize_photos,
        "recording_started_at": state_row.recording_started_at.isoformat() if state_row.recording_started_at else None,
        "recording_limit_seconds": state_row.recording_limit_seconds,
        "recording_duration_seconds": state_row.recording_duration_seconds,
        "chunk_duration_seconds": state_row.chunk_duration_seconds,
        "expires_at": state_row.expires_at.isoformat() if state_row.expires_at else None,
        "stopped_at": state_row.stopped_at.isoformat() if state_row.stopped_at else None,
        "quota_reserved": state_row.quota_reserved,
        "ingest": ingest,
        "segments": segments_dict,
        "processing_jobs": state_row.processing_jobs or {},
        "processing_metrics": state_row.processing_metrics or {},
        "progress": {
            "segments_total": state_row.segments_total,
            "segments_done": state_row.segments_done,
            "photos_total": state_row.photos_total,
            "photos_done": state_row.photos_done
        },
        "transcript": state_row.transcript or ""
    }
    return data


def load_state(project_id):
    cache_key = _state_cache_key(project_id)
    try:
        cached_raw = _redis.get(cache_key)
        if cached_raw:
            cached_bytes = cast(bytes, cached_raw)
            return json.loads(cached_bytes.decode("utf-8"))
    except Exception:
        pass

    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None

    session = Session()
    try:
        state_row, project_row, chunks, segments = _fetch_state_rows(session, project_uuid)
        if not state_row:
            return None
        data = _build_state_dict(state_row, project_row, chunks, segments)
        try:
            _redis.setex(cache_key, 30, json.dumps(data, ensure_ascii=False).encode("utf-8"))
        except Exception:
            pass
        return data
    finally:
        Session.remove()


def update_state_fields(project_id, updates):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None
    session = Session()
    try:
        state = (
            session.query(ProjectState)
            .filter_by(project_id=project_uuid)
            .with_for_update()
            .first()
        )
        if not state:
            return None
        project_obj = None
        for key, value in updates.items():
            if key == "project_name":
                if project_obj is None:
                    project_obj = (
                        session.query(Project)
                        .filter_by(id=project_uuid)
                        .with_for_update()
                        .first()
                    )
                if project_obj:
                    setattr(project_obj, "title", value or "Sin título")
                continue

            if not hasattr(ProjectState, key):
                log.warning("Campo de estado desconocido: %s", key)
                continue

            if key in {"recording_started_at", "stopped_at", "expires_at"} and isinstance(value, str):
                try:
                    value = datetime.fromisoformat(value)
                except ValueError:
                    continue
            setattr(state, key, value)

        session.commit()
    finally:
        Session.remove()
    _invalidate_cache(project_id)
    return load_state(project_id)


def mark_stopped(project_id):
    return update_state_fields(project_id, {"stopped_at": utcnow()})


def is_project_stopped(project_id):
    state = load_state(project_id)
    if not state:
        return True
    return state.get("stopped_at") is not None


def is_project_active(project_id):
    return project_exists(project_id) and not is_project_stopped(project_id)


def append_ingest_chunk(project_id, chunk_entry):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        raise ValueError("Proyecto no encontrado")

    session = Session()
    try:
        seq_value = int(chunk_entry["seq"])
        chunk = (
            session.query(ProjectIngestChunk)
            .filter_by(project_id=project_uuid, seq=seq_value)
            .with_for_update()
            .first()
        )

        new_start = int(chunk_entry.get("start_ms", 0))
        new_duration = int(chunk_entry.get("duration_ms", 0))
        new_bytes = int(chunk_entry.get("bytes", 0))
        storage_backend = chunk_entry.get("storage", "disk")
        storage_path = chunk_entry.get("path")

        previous_bytes = 0
        if chunk:
            previous_bytes = chunk.bytes or 0
            setattr(chunk, "start_ms", new_start)
            setattr(chunk, "duration_ms", new_duration)
            setattr(chunk, "bytes", new_bytes)
            setattr(chunk, "storage_backend", storage_backend)
            setattr(chunk, "storage_path", storage_path)
        else:
            chunk = ProjectIngestChunk(
                project_id=project_uuid,
                seq=seq_value,
                start_ms=new_start,
                duration_ms=new_duration,
                bytes=new_bytes,
                storage_backend=storage_backend,
                storage_path=storage_path
            )
            session.add(chunk)

        end_ms = new_start + new_duration
        delta_bytes = new_bytes - previous_bytes
        session.execute(
            update(ProjectState)
            .where(ProjectState.project_id == project_uuid)
            .values(
                ingest_duration_ms=func.greatest(ProjectState.ingest_duration_ms, end_ms),
                ingest_bytes_total=func.greatest(
                    ProjectState.ingest_bytes_total + delta_bytes,
                    0
                ),
                last_seq=func.greatest(ProjectState.last_seq, chunk.seq)
            )
        )
        session.commit()
    finally:
        Session.remove()
    _invalidate_cache(project_id)


def get_ingest_data(project_id):
    state = load_state(project_id)
    return state.get("ingest", {}) if state else {}


def replace_segments(project_id, segments):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        raise ValueError("Proyecto no encontrado")
    session = Session()
    try:
        session.query(ProjectSegment).filter_by(project_id=project_uuid).delete(synchronize_session=False)
        rows = []
        for segment_id, data in segments.items():
            rows.append(ProjectSegment(
                project_id=project_uuid,
                segment_id=segment_id,
                start_ms=int(data.get("start_ms", 0)),
                end_ms=int(data.get("end_ms", 0)),
                wav_path=data.get("wav_path"),
                text_path=data.get("text_path"),
                status=data.get("status", "pending"),
                text=data.get("text"),
                transcription_time=Decimal(str(float(data.get("transcription_time", 0.0) or 0.0)))
            ))
        if rows:
            session.add_all(rows)
        session.execute(
            update(ProjectState)
            .where(ProjectState.project_id == project_uuid)
            .values(
                segments_total=len(rows),
                segments_done=0
            )
        )
        session.commit()
    finally:
        Session.remove()
    _invalidate_cache(project_id)


def get_segment(project_id, segment_id):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None
    session = Session()
    try:
        seg = (
            session.query(ProjectSegment)
            .filter_by(project_id=project_uuid, segment_id=segment_id)
            .first()
        )
        if not seg:
            return None
        transcription_value = getattr(seg, "transcription_time")
        return {
            "segment_id": seg.segment_id,
            "start_ms": seg.start_ms,
            "end_ms": seg.end_ms,
            "wav_path": seg.wav_path,
            "text_path": seg.text_path,
            "status": seg.status,
            "text": seg.text,
            "transcription_time": _as_float(transcription_value)
        }
    finally:
        Session.remove()


def update_segment_text(project_id, segment_id, text, elapsed):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return
    session = Session()
    try:
        segment = (
            session.query(ProjectSegment)
            .filter_by(project_id=project_uuid, segment_id=segment_id)
            .with_for_update()
            .first()
        )
        if not segment:
            return
        status_value = getattr(segment, "status") or ""
        already_done = status_value == "done"
        setattr(segment, "text", text)
        setattr(segment, "transcription_time", Decimal(str(float(elapsed))))
        setattr(segment, "status", "done")

        if not already_done:
            _increment_progress_rows(session, project_uuid, segments_delta=1)

        session.commit()
    finally:
        Session.remove()
    _invalidate_cache(project_id)


def set_processing_jobs(project_id, jobs_dict):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None
    session = Session()
    try:
        session.query(ProjectState).filter_by(project_id=project_uuid).update(
            {ProjectState.processing_jobs: jobs_dict}
        )
        session.commit()
    finally:
        Session.remove()
    _invalidate_cache(project_id)
    return jobs_dict


def update_processing_jobs(project_id, updates):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return None
    session = Session()
    try:
        state = session.query(ProjectState).filter_by(project_id=project_uuid).with_for_update().first()
        if not state:
            return None
        jobs = getattr(state, "processing_jobs") or {}
        jobs.update(updates)
        setattr(state, "processing_jobs", jobs)
        session.commit()
        result = jobs
    finally:
        Session.remove()
    _invalidate_cache(project_id)
    return result


def _increment_progress_rows(session, project_uuid, segments_delta=0, photos_delta=0):
    updates = {}
    if segments_delta:
        updates["segments_done"] = ProjectState.segments_done + segments_delta
    if photos_delta:
        updates["photos_done"] = ProjectState.photos_done + photos_delta
    if updates:
        session.execute(
            update(ProjectState)
            .where(ProjectState.project_id == project_uuid)
            .values(**updates)
        )


def increment_progress(project_id, segments_delta=0, photos_delta=0):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return
    session = Session()
    try:
        _increment_progress_rows(
            session,
            project_uuid,
            segments_delta=segments_delta,
            photos_delta=photos_delta
        )
        session.commit()
    finally:
        Session.remove()
    if segments_delta or photos_delta:
        _invalidate_cache(project_id)


def update_project_status(project_id, **fields):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return False
    session = Session()
    try:
        project = session.query(Project).filter_by(id=project_uuid).first()
        if not project:
            return False

        status = fields.pop("status", None)
        if status is not None:
            project.status = status
        for attr in [
            "job_id",
            "output_file",
            "fallback_file",
            "error_message",
            "stylize_errors",
            "llm_prompt_tokens",
            "llm_completion_tokens",
            "llm_total_tokens",
            "llm_cost_usd"
        ]:
            if attr in fields and fields[attr] is not None:
                value = fields[attr]
                if attr == "job_id" and value is not None:
                    value = _to_uuid(value)
                setattr(project, attr, value)
        session.commit()
        return True
    finally:
        Session.remove()


def delete_project(project_id):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        raise ValueError("Invalid project_id")

    session = Session()
    try:
        project_record = session.query(Project).filter_by(id=project_uuid).first()
        if project_record:
            session.delete(project_record)
            session.commit()
    finally:
        Session.remove()

    project_dir = get_project_dir(project_id)
    if os.path.isdir(project_dir):
        shutil.rmtree(project_dir)
    _invalidate_cache(project_id)
    log.info("Proyecto eliminado: %s", project_id)
    return True


def list_projects(user_id, limit=10, offset=0, query=None, status=None):
    user_uuid = _to_uuid(user_id)
    if not user_uuid:
        return [], 0

    session = Session()
    try:
        photo_counts = (
            session.query(
                ProjectPhoto.project_id.label("project_id"),
                func.count(ProjectPhoto.id).label("photo_count")
            )
            .group_by(ProjectPhoto.project_id)
            .subquery()
        )

        base = (
            session.query(Project, ProjectState, photo_counts.c.photo_count)
            .join(ProjectState, ProjectState.project_id == Project.id)
            .outerjoin(photo_counts, photo_counts.c.project_id == Project.id)
            .filter(Project.user_id == user_uuid)
        )

        if query:
            like = f"%{query}%"
            base = base.filter(
                (Project.title.ilike(like))
                | (ProjectState.participant_name.ilike(like))
            )

        if status:
            base = base.filter(Project.status == status)

        total = base.count()
        rows = (
            base.order_by(Project.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        projects = []
        for project, state_row, photo_count in rows:
            projects.append({
                "project_id": str(project.id),
                "project_name": project.title,
                "participant_name": state_row.participant_name,
                "status": project.status,
                "job_status": project.status,
                "is_active": project.status == "recording",
                "recording_duration_seconds": state_row.recording_duration_seconds,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "expires_at": project.expires_at.isoformat() if project.expires_at else None,
                "stylize_errors": project.stylize_errors,
                "photo_count": int(photo_count or 0)
            })

        return projects, total
    finally:
        Session.remove()


def set_quota_reserved(project_id, reserved=True):
    update_state_fields(project_id, {"quota_reserved": bool(reserved)})


def is_quota_reserved(project_id):
    state = load_state(project_id)
    if not state:
        return False
    return bool(state.get("quota_reserved"))


def get_recording_elapsed_seconds(project_id):
    state = load_state(project_id)
    if not state:
        return None
    started = state.get("recording_started_at")
    if not started:
        return None
    started_dt = datetime.fromisoformat(started)
    if started_dt.tzinfo is None:
        started_dt = started_dt.replace(tzinfo=timezone.utc)
    now = utcnow()
    elapsed = now - started_dt
    return max(0, int(elapsed.total_seconds()))


def is_recording_limit_exceeded(project_id):
    state = load_state(project_id)
    if not state:
        return False
    limit_seconds = state.get("recording_limit_seconds")
    if not limit_seconds:
        return False
    elapsed = get_recording_elapsed_seconds(project_id)
    if elapsed is None:
        return False
    return elapsed >= int(limit_seconds)


def export_project_state(project_id):
    data = load_state(project_id)
    if not data:
        return None
    from services import timeline as timeline_service

    data["photos"] = timeline_service.get_photos(project_id)
    return data
