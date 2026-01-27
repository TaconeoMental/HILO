import { redirect } from "next/navigation";
import RecorderShell from "@/components/record/RecorderShell";
import { isAuthenticated } from "@/lib/auth";

export default async function RecordPage() {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/login");
  }

  return <RecorderShell />;
}
