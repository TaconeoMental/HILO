"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (newPassword !== confirmPassword) {
        setError("Las contraseñas no coinciden");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "No se pudo cambiar la contraseña");
        setLoading(false);
        return;
      }
      router.push(data.redirect || "/projects");
    } catch (err) {
      setError("No se pudo cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-error/60 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary" htmlFor="current_password">
          Contraseña actual
        </label>
        <input
          id="current_password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Tu contraseña actual"
          className="w-full rounded-lg border border-transparent bg-bg-surface-light px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary" htmlFor="new_password">
          Nueva contraseña
        </label>
        <input
          id="new_password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Mínimo 8 caracteres"
          className="w-full rounded-lg border border-transparent bg-bg-surface-light px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          required
          minLength={8}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary" htmlFor="confirm_password">
          Confirmar contraseña
        </label>
        <input
          id="confirm_password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repite la nueva contraseña"
          className="w-full rounded-lg border border-transparent bg-bg-surface-light px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>Guardar cambios</span>
      </button>
    </form>
  );
}
