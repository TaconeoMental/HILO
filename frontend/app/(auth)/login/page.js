import { redirect } from "next/navigation";
import LoginForm from "@/components/Auth/LoginForm";
import { isAuthenticated } from "@/lib/auth";

export default async function LoginPage() {
  const authed = await isAuthenticated();
  if (authed) {
    redirect("/projects");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-bg-surface-light bg-bg-surface/70 p-8 shadow-lg shadow-black/40">
        <h1 className="text-center text-2xl font-semibold text-text-primary">Bienvenido</h1>
        <p className="mt-2 text-center text-sm text-text-muted">
          Inicia sesión para continuar
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
