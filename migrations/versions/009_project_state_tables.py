"""add project state tables

Revision ID: 009_project_state_tables
Revises: 008_remove_script_quota
Create Date: 2026-01-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '009_project_state_tables'
down_revision = '008_remove_script_quota'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'project_states',
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('participant_name', sa.String(length=255), nullable=True),
        sa.Column('stylize_photos', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('recording_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recording_limit_seconds', sa.Integer(), nullable=True),
        sa.Column('recording_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('chunk_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('stopped_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('quota_reserved', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('ingest_duration_ms', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('ingest_bytes_total', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('last_seq', sa.Integer(), nullable=False, server_default='-1'),
        sa.Column('segments_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('segments_done', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('photos_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('photos_done', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('processing_jobs', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('processing_metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('transcript', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())"))
    )

    op.create_table(
        'project_ingest_chunks',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('start_ms', sa.BigInteger(), nullable=False),
        sa.Column('duration_ms', sa.BigInteger(), nullable=False),
        sa.Column('bytes', sa.BigInteger(), nullable=False),
        sa.Column('storage_backend', sa.String(length=32), nullable=False),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())")),
        sa.UniqueConstraint('project_id', 'seq', name='uq_project_chunk_seq')
    )
    op.create_index('ix_project_ingest_chunks_project_id', 'project_ingest_chunks', ['project_id'])

    op.create_table(
        'project_segments',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('segment_id', sa.String(length=64), nullable=False),
        sa.Column('start_ms', sa.BigInteger(), nullable=False),
        sa.Column('end_ms', sa.BigInteger(), nullable=False),
        sa.Column('wav_path', sa.Text(), nullable=False),
        sa.Column('text_path', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('transcription_time', sa.Numeric(10, 4), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())")),
        sa.UniqueConstraint('project_id', 'segment_id', name='uq_project_segment')
    )
    op.create_index('ix_project_segments_project_id', 'project_segments', ['project_id'])

    op.create_table(
        'project_photos',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('photo_id', sa.String(length=64), nullable=False),
        sa.Column('t_ms', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('original_path', sa.Text(), nullable=False),
        sa.Column('stylized_path', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("timezone('utc', now())")),
        sa.UniqueConstraint('project_id', 'photo_id', name='uq_project_photo')
    )
    op.create_index('ix_project_photos_project_id', 'project_photos', ['project_id'])


def downgrade():
    op.drop_index('ix_project_photos_project_id', table_name='project_photos')
    op.drop_table('project_photos')
    op.drop_index('ix_project_segments_project_id', table_name='project_segments')
    op.drop_table('project_segments')
    op.drop_index('ix_project_ingest_chunks_project_id', table_name='project_ingest_chunks')
    op.drop_table('project_ingest_chunks')
    op.drop_table('project_states')
