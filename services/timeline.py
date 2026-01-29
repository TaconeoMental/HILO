import uuid

from sqlalchemy import update

from extensions import Session
from models import ProjectPhoto, ProjectState
from services import project_store


def _to_uuid(value):
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def add_photo(project_id, photo_id, t_ms, original_path, stylized_path=None):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        raise ValueError("project_id inválido")

    session = Session()
    try:
        photo = ProjectPhoto(
            project_id=project_uuid,
            photo_id=photo_id,
            t_ms=int(t_ms or 0),
            original_path=original_path,
            stylized_path=stylized_path
        )
        session.add(photo)
        session.flush()

        session.execute(
            update(ProjectState)
            .where(ProjectState.project_id == project_uuid)
            .values(photos_total=ProjectState.photos_total + 1)
        )
        session.commit()
        project_store.invalidate_cache(project_id)

        return {
            "photo_id": photo_id,
            "t_ms": int(t_ms or 0),
            "original_path": original_path,
            "stylized_path": stylized_path
        }
    finally:
        Session.remove()


def update_photo_stylized(project_id, photo_id, stylized_path):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        raise ValueError("project_id inválido")

    session = Session()
    try:
        photo = (
            session.query(ProjectPhoto)
            .filter_by(project_id=project_uuid, photo_id=photo_id)
            .with_for_update()
            .first()
        )
        if not photo:
            session.rollback()
            return False

        already_stylized = bool(photo.stylized_path)
        photo.stylized_path = stylized_path

        if stylized_path and not already_stylized:
            session.execute(
                update(ProjectState)
                .where(ProjectState.project_id == project_uuid)
                .values(photos_done=ProjectState.photos_done + 1)
            )

        session.commit()
        project_store.invalidate_cache(project_id)
        return True
    finally:
        Session.remove()


def get_photos(project_id):
    project_uuid = _to_uuid(project_id)
    if not project_uuid:
        return []

    session = Session()
    try:
        photos = (
            session.query(ProjectPhoto)
            .filter_by(project_id=project_uuid)
            .order_by(ProjectPhoto.t_ms.asc(), ProjectPhoto.id.asc())
            .all()
        )
        return [
            {
                "photo_id": photo.photo_id,
                "t_ms": photo.t_ms,
                "original_path": photo.original_path,
                "stylized_path": photo.stylized_path
            }
            for photo in photos
        ]
    finally:
        Session.remove()
