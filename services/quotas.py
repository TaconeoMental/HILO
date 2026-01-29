from datetime import timedelta

from extensions import Session
from logger import get_logger
from models import User, utcnow


log = get_logger("quota")


WINDOW_HOURS = 24
SECONDS_PER_MINUTE = 60


def _reset_window(user, started_attr, used_attr, now):
    started_at = getattr(user, started_attr)
    if not started_at or now - started_at >= timedelta(hours=WINDOW_HOURS):
        setattr(user, started_attr, now)
        setattr(user, used_attr, 0)
        return True
    return False


def get_recording_quota(user_id):
    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return None

        if user.is_admin:
            return {
                "total_seconds": None,
                "used_seconds": 0,
                "remaining_seconds": None,
                "window_days": None,
                "reset_at": None
            }

        quota_minutes = user.recording_minutes_quota
        if quota_minutes is None:
            return {
                "total_seconds": None,
                "used_seconds": 0,
                "remaining_seconds": None,
                "window_days": user.recording_window_days,
                "reset_at": None
            }

        try:
            quota_minutes = int(quota_minutes)
        except (TypeError, ValueError):
            quota_minutes = 0

        total_seconds = max(0, quota_minutes) * SECONDS_PER_MINUTE
        used_seconds = int(user.recording_seconds_used or 0)

        now = utcnow()
        window_days = user.recording_window_days
        reset_at = None
        if window_days:
            started_at = user.recording_window_started_at
            if not started_at or now - started_at >= timedelta(days=window_days):
                user.recording_window_started_at = now
                user.recording_seconds_used = 0
                used_seconds = 0
                db.commit()
                started_at = now
            reset_at = started_at + timedelta(days=window_days)

        remaining_seconds = max(0, total_seconds - used_seconds)
        return {
            "total_seconds": total_seconds,
            "used_seconds": used_seconds,
            "remaining_seconds": remaining_seconds,
            "window_days": window_days,
            "reset_at": reset_at
        }
    finally:
        Session.remove()


def consume_recording_seconds(user_id, seconds):
    if seconds <= 0:
        return

    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user or user.is_admin:
            return

        if user.recording_minutes_quota is None:
            return

        now = utcnow()
        window_days = user.recording_window_days
        if window_days:
            started_at = user.recording_window_started_at
            if not started_at or now - started_at >= timedelta(days=window_days):
                user.recording_window_started_at = now
                user.recording_seconds_used = 0

        current_used = int(user.recording_seconds_used or 0)
        user.recording_seconds_used = current_used + int(seconds)
        db.commit()
    finally:
        Session.remove()


def reserve_stylize_quota(user_id, reason=""):
    return _reserve_quota(
        user_id,
        quota_attr="daily_stylize_quota",
        used_attr="stylizes_used_in_window",
        started_attr="stylize_window_started_at",
        label="estilizaciones",
        reason=reason,
        requires_flag="can_stylize_images"
    )


def release_stylize_quota(user_id):
    _release_quota(
        user_id,
        quota_attr="daily_stylize_quota",
        used_attr="stylizes_used_in_window"
    )


def _release_quota(user_id, quota_attr, used_attr):
    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user or user.is_admin:
            return

        if getattr(user, quota_attr) is None:
            return

        used = getattr(user, used_attr) or 0
        if used > 0:
            setattr(user, used_attr, used - 1)
            db.commit()
    finally:
        Session.remove()


def _reserve_quota(
    user_id,
    quota_attr,
    used_attr,
    started_attr,
    label,
    reason="",
    requires_flag=None
):
    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return False, "Usuario no encontrado"

        if user.is_admin:
            return True, None

        if requires_flag and not getattr(user, requires_flag, False):
            return False, "No tienes permiso para usar esta función"

        quota_value = getattr(user, quota_attr)
        if quota_value is None:
            return True, None

        try:
            quota_value = int(quota_value)
        except (TypeError, ValueError):
            return False, "La cuota no es válida"

        if quota_value <= 0:
            return False, f"No tienes cuota disponible para {label}"

        now = utcnow()
        _reset_window(user, started_attr, used_attr, now)

        used = getattr(user, used_attr) or 0
        if used >= quota_value:
            return False, f"Has alcanzado tu cuota diaria de {label}"

        setattr(user, used_attr, used + 1)
        db.commit()

        if reason:
            log.info(f"Reserva de cuota {label}: user={user.id} reason={reason}")

        return True, None
    finally:
        Session.remove()


def has_stylize_quota(user_id):
    db = Session()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return False
        if user.is_admin:
            return True
        if not user.can_stylize_images:
            return False

        quota_value = user.daily_stylize_quota
        if quota_value is None:
            return True
        try:
            quota_value = int(quota_value)
        except (TypeError, ValueError):
            return False
        if quota_value <= 0:
            return False

        now = utcnow()
        started_at = user.stylize_window_started_at
        used = user.stylizes_used_in_window or 0
        if not started_at or now - started_at >= timedelta(hours=WINDOW_HOURS):
            used = 0

        return used < quota_value
    finally:
        Session.remove()
