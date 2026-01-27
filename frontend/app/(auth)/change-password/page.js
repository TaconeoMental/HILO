import { redirect } from "next/navigation";
import ChangePasswordForm from "@/components/Auth/ChangePasswordForm";
import { isAuthenticated } from "@/lib/auth";

export default async function ChangePasswordPage() {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-bg-surface-light bg-bg-surface/70 p-8 shadow-lg shadow-black/40">
        <h1 className="text-center text-2xl font-semibold text-text-primary">Cambiar contraseña</h1>
        <p className="mt-2 text-center text-sm text-text-muted">
          Actualiza tu contraseña de acceso
        </p>
        <div className="mt-8">
          <ChangePasswordForm />
        </div>
        <div className="mt-4">
          <a
            href="/projects"
            className="flex w-full items-center justify-center rounded-lg border border-bg-surface-light px-4 py-3 text-sm font-semibold text-text-secondary hover:border-accent"
          >
            Cancelar
          </a>
        </div>
      </div>
    </div>
  );
}
