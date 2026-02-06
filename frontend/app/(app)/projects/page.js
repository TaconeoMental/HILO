import { redirect } from "next/navigation";
import ProjectsList from "@/components/Projects/ProjectsList";
import { getUser } from "@/lib/auth";

export default async function ProjectsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/change-password");

  return <ProjectsList />;
}
