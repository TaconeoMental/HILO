"use client";

import Link from "next/link";
import {
  CalendarIcon,
  ClockIcon,
  CameraIcon,
  ArrowPathIcon
} from "@heroicons/react/24/solid";

const STATUS_LABELS = {
  recording: "Grabando",
  queued: "En cola",
  processing: "En proceso",
  done: "Finalizado",
  error: "Error"
};

export default function ProjectCard({ project, onRequestDelete }) {
  const status = project.status || (project.is_active ? "recording" : project.job_status);
  const statusLabel = STATUS_LABELS[status] || "Finalizado";
  const durationLabel = formatDuration(project.recording_duration_seconds);
  const expiryLabel = formatExpiry(project.expires_at);
  const hasStylizeErrors = (project.stylize_errors || 0) > 0;

  const onDeleteClick = () => {
    onRequestDelete?.(project);
  };

  return (
    <div className="rounded-2xl border border-bg-surface-light bg-bg-surface/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-accent">
            {project.project_name || "Sin título"}
          </h3>
          {project.participant_name ? (
            <p className="text-sm text-text-muted">{project.participant_name}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusClassName(status)}>
            {status === "processing" ? (
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {statusLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            {expiryLabel}
          </span>
          {hasStylizeErrors ? (
            <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
              Fotos
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <CalendarIcon className="h-3.5 w-3.5" />
          {project.created_at ? new Date(project.created_at).toLocaleString("es-ES") : "-"}
        </span>
        <span className="inline-flex items-center gap-1">
          <CameraIcon className="h-3.5 w-3.5" />
          {project.photo_count} fotos
        </span>
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="h-3.5 w-3.5" />
          {durationLabel}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {project.job_status === "done" ? (
          <Link
            href={`/r/${project.project_id}`}
            className="rounded-full border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white"
          >
            Ver Guion
          </Link>
        ) : null}
        {["queued", "processing"].includes(project.job_status) ? (
          <Link
            href={`/r/${project.project_id}`}
            className="rounded-full border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-primary"
          >
            Ver Estado
          </Link>
        ) : null}
        {project.is_active ? (
          <span className="rounded-full border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-primary">
            Grabando
          </span>
        ) : null}
        <button
          onClick={onDeleteClick}
          className="rounded-full border border-error/70 px-4 py-2 text-xs font-semibold text-error"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

function statusClassName(status) {
  const base = "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold";
  if (status === "processing" || status === "queued") {
    return `${base} border-warning/40 bg-warning/10 text-warning`;
  }
  if (status === "error") {
    return `${base} border-error/40 bg-error/10 text-error`;
  }
  if (status === "done") {
    return `${base} border-success/40 bg-success/10 text-success`;
  }
  return `${base} border-accent/40 bg-accent/10 text-accent`;
}

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return "-";
  const seconds = Math.max(0, Number(totalSeconds));
  if (Number.isNaN(seconds)) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatExpiry(value) {
  if (!value) return "Sin expiración";
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return "Sin expiración";
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return "Expirado";
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `Expira en ${diffMinutes} min`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Expira en ${diffHours} h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `Expira en ${diffDays} días`;
}
