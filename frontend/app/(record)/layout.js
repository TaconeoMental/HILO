import AppShell from "@/components/AppShell";
import { getUser } from "@/lib/auth";

export default async function RecordLayout({ children }) {
  const user = await getUser();
  return (
    <AppShell user={user} hideNavOnMobile>
      {children}
    </AppShell>
  );
}
