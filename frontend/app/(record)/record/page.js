import { redirect } from "next/navigation";
import RecorderShell from "@/components/record/RecorderShell";
import { getUser } from "@/lib/auth";

export default async function RecordPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/change-password");

  return <RecorderShell />;
}
