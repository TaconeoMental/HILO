import AppShell from "@/components/AppShell";
import { getUser } from "@/lib/auth";

export default async function AppLayout({ children }) {
  const user = await getUser();
  return <AppShell user={user}>{children}</AppShell>;
}
