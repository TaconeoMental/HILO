import { redirect } from "next/navigation";
import ProjectsList from "@/components/Projects/ProjectsList";
import { isAuthenticated } from "@/lib/auth";

export default async function ProjectsPage() {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/login");
  }

  return <ProjectsList />;
}
