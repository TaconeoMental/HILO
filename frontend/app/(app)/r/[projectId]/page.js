import { notFound, redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { fetchServerApi } from "@/lib/serverApi";
import ResultClient from "@/components/Results/ResultClient";

async function fetchStatus(projectId) {
  const res = await fetchServerApi(`/api/project/${projectId}/status`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!data.ok) return null;
  return data;
}

export default async function ResultPage({ params }) {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/login");
  }

  const { projectId } = await params;
  const status = await fetchStatus(projectId);
  if (!status) {
    notFound();
  }

  return (
    <ResultClient
      projectId={projectId}
      initialStatus={status.status}
      initialError={status.error}
      initialOutputFile={status.output_file}
      initialFallbackFile={status.fallback_file}
      projectName={status.project_name}
    />
  );
}
