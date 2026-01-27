import { redirect } from "next/navigation";
import AdminShell from "@/components/Admin/AdminShell";
import { getUser } from "@/lib/auth";

export default async function AdminPage() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.is_admin) {
    redirect("/projects");
  }

  return <AdminShell user={user} />;
}
