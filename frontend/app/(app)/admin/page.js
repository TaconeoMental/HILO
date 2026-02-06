import { redirect } from "next/navigation";
import AdminShell from "@/components/Admin/AdminShell";
import { getUser } from "@/lib/auth";

export default async function AdminPage() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  if (user.must_change_password) {
    redirect("/change-password");
  }
  if (!user.is_admin) {
    redirect("/projects");
  }

  return <AdminShell user={user} />;
}
