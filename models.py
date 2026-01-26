import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    DateTime,
    Text,
    ForeignKey,
    BigInteger,
    Numeric
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, relationship
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin

Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class User(Base, UserMixin):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)

    is_admin = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)

    can_stylize_images = Column(Boolean, default=False, nullable=False)
    daily_stylize_quota = Column(Integer, nullable=True)
    stylizes_used_in_window = Column(Integer, default=0, nullable=False)
    stylize_window_started_at = Column(
        DateTime(timezone=True), nullable=True
    )
    recording_minutes_quota = Column(Integer, nullable=True)
    recording_seconds_used = Column(Integer, default=0, nullable=False)
    recording_window_days = Column(Integer, nullable=True)
    recording_window_started_at = Column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps
    created_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    sessions = relationship(
        "UserSession",
        back_populates="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    projects = relationship(
        "Project",
        back_populates="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_id(self):
        return str(self.id)

    def __repr__(self):
        return f"<User {self.username}>"


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    created_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    last_seen_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)

    ip = Column(String(45), nullable=True)  # IPv6 max length
    user_agent = Column(Text, nullable=True)

    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="sessions")

    @property
    def is_valid(self):
        if self.revoked_at is not None:
            return False
        if utcnow() > self.expires_at:
            return False
        return True

    def revoke(self):
        self.revoked_at = utcnow()

    def touch(self):
        self.last_seen_at = utcnow()

    def __repr__(self):
        return f"<UserSession {self.id} user={self.user_id}>"


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    title = Column(String(255), nullable=False, default="")
    status = Column(String(32), nullable=False, default="recording")

    created_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)

    job_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    output_file = Column(Text, nullable=True)
    fallback_file = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    stylize_errors = Column(Integer, nullable=False, default=0)

    llm_prompt_tokens = Column(Integer, nullable=True)
    llm_completion_tokens = Column(Integer, nullable=True)
    llm_total_tokens = Column(Integer, nullable=True)
    llm_cost_usd = Column(Numeric(10, 4), nullable=True)

    user = relationship("User", back_populates="projects")

    def __repr__(self):
        return f"<Project {self.id} user={self.user_id} status={self.status}>"


class ProjectEvent(Base):
    __tablename__ = "project_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    created_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    def __repr__(self):
        return f"<ProjectEvent {self.id} project={self.project_id}>"


class PhotoEvent(Base):
    __tablename__ = "photo_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    created_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    def __repr__(self):
        return f"<PhotoEvent {self.id} project={self.project_id}>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    actor_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    action = Column(Text, nullable=False, index=True)
    target_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    details = Column(JSONB, nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    ip = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)

    def __repr__(self):
        return f"<AuditLog {self.id} action={self.action}>"


def log_audit(
    session, action, actor_user_id=None, target_user_id=None,
    details=None, ip=None, user_agent=None
):
    entry = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_user_id=target_user_id,
        details=details,
        ip=ip,
        user_agent=user_agent
    )
    session.add(entry)
    return entry


def log_audit_for_request(
    session,
    action,
    actor_user_id=None,
    target_user_id=None,
    details=None,
    request=None
):
    ip = None
    user_agent = None
    if request:
        ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        user_agent = request.user_agent.string
    return log_audit(
        session,
        action=action,
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        details=details,
        ip=ip,
        user_agent=user_agent
    )
