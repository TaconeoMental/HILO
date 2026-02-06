import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { fetchServerApi } from "@/lib/serverApi";
import ResultClient from "@/components/Results/ResultClient";

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return "-";
  const seconds = Math.max(0, Number(totalSeconds));
  if (Number.isNaN(seconds)) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-ES", { timeZone: "UTC" });
}

function formatExpiry(value) {
  if (!value) return "Sin expiración";
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return "Sin expiración";
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) return "Expirado";
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `Expira en ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Expira en ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Expira en ${diffDays} días`;
}

async function fetchStatus(projectId) {
  const res = await fetchServerApi(`/api/project/${projectId}/status`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!data.ok) return null;
  return data;
}

export default async function ResultPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/change-password");

  const { projectId } = await params;
  const status = await fetchStatus(projectId);
  if (!status) {
    notFound();
  }

  const createdLabel = formatDate(status.created_at);
  const expiryLabel = formatExpiry(status.expires_at);
  const durationLabel = formatDuration(status.recording_duration_seconds);

  return (
    <ResultClient
      projectId={projectId}
      initialStatus={status.status}
      initialError={status.error}
      projectName={status.project_name}
      initialParticipantName={status.participant_name}
      initialCreatedAt={status.created_at}
      initialExpiresAt={status.expires_at}
      initialRecordingDuration={status.recording_duration_seconds}
      createdLabel={createdLabel}
      expiryLabel={expiryLabel}
      durationLabel={durationLabel}
    />
  );
}
