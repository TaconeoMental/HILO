import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getUser } from "@/lib/auth";

export default async function RecordLayout({ children }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/change-password");
  return (
    <AppShell user={user} hideNavOnMobile showNewRecording={false} fullHeight>
      {children}
    </AppShell>
  );
}
