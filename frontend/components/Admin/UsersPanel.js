"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/common/Modal";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";

const LIMIT_OPTIONS = [10, 25, 50];

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-ES");
}

function formatOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function Switch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-bg-surface-light"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-4 w-4"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function PasswordDisplay({ password, onToast }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      onToast?.("Contraseña copiada", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.("Error al copiar", "error");
    }
  };

  return (
    <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3">
      <div className="text-xs uppercase text-text-muted">Contraseña temporal</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-sm text-text-primary">{password}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            copied
              ? "border-success/40 bg-success/20 text-success"
              : "border-bg-surface-light bg-bg-surface-light/30 text-text-secondary hover:text-text-primary"
          }`}
        >
          {copied ? <CheckIcon /> : <ClipboardIcon />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export default function UsersPanel({ onToast }) {
  const { items, total, limit, loading, load, applyFilters } = useAdminUsers();
  const [queryInput, setQueryInput] = useState("");
  const [limitInput, setLimitInput] = useState(String(limit));
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    is_active: true,
    can_stylize_images: false,
    daily_stylize_quota: "",
    recording_minutes_quota: "",
    recording_window_days: ""
  });
  const [createResult, setCreateResult] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [quotaResetResult, setQuotaResetResult] = useState(null);

  const canLoadMore = items.length < total;

  const loadSafe = useCallback(
    async (options = {}) => {
      try {
        await load(options);
      } catch (error) {
        onToast?.(error.message || "Error cargando usuarios", "error");
      }
    },
    [load, onToast]
  );

  useEffect(() => {
    loadSafe({ reset: true });
  }, [loadSafe]);

  const onApplyFilters = (event) => {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    const nextLimit = Number(limitInput) || 10;
    applyFilters(nextQuery, nextLimit);
    loadSafe({ reset: true, query: nextQuery, limit: nextLimit });
  };

  const resetCreateForm = () => {
    setCreateForm({
      username: "",
      is_active: true,
      can_stylize_images: false,
      daily_stylize_quota: "",
      recording_minutes_quota: "",
      recording_window_days: ""
    });
    setCreateResult(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.username.trim()) {
      onToast?.("username requerido", "error");
      return;
    }
    setCreateLoading(true);
    try {
      const payload = {
        username: createForm.username.trim(),
        is_active: createForm.is_active,
        can_stylize_images: createForm.can_stylize_images,
        daily_stylize_quota: createForm.can_stylize_images
          ? formatOptionalNumber(createForm.daily_stylize_quota)
          : 0,
        recording_minutes_quota: formatOptionalNumber(createForm.recording_minutes_quota),
        recording_window_days: formatOptionalNumber(createForm.recording_window_days)
      };
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error creando usuario");
      }
      setCreateResult({
        user: data.user,
        temp_password: data.temp_password
      });
      loadSafe({ reset: true });
    } catch (error) {
      onToast?.(error.message || "Error creando usuario", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const res = await fetch(`/api/admin/user/${resetTarget.id}/reset-password`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error reseteando contraseña");
      }
      setResetResult({
        user: data.user,
        temp_password: data.temp_password
      });
    } catch (error) {
      onToast?.(error.message || "Error reseteando contraseña", "error");
    } finally {
      setResetLoading(false);
    }
  };

  const openEdit = (user) => {
    setEditTarget(user);
    setEditForm({
      can_stylize_images: Boolean(user.can_stylize_images),
      daily_stylize_quota: user.daily_stylize_quota ?? "",
      recording_minutes_quota: user.recording_minutes_quota ?? "",
      recording_window_days: user.recording_window_days ?? ""
    });
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editForm) return;

    setEditLoading(true);
    try {
      const flagsPayload = {};
      const nextDaily = editForm.can_stylize_images
        ? formatOptionalNumber(editForm.daily_stylize_quota)
        : 0;
      const nextRecording = formatOptionalNumber(editForm.recording_minutes_quota);
      const nextWindow = formatOptionalNumber(editForm.recording_window_days);

      if (editForm.can_stylize_images !== editTarget.can_stylize_images) {
        flagsPayload.can_stylize_images = editForm.can_stylize_images;
      }
      if (nextDaily !== editTarget.daily_stylize_quota) {
        flagsPayload.daily_stylize_quota = nextDaily;
      }
      if (nextRecording !== editTarget.recording_minutes_quota) {
        flagsPayload.recording_minutes_quota = nextRecording;
      }
      if (nextWindow !== editTarget.recording_window_days) {
        flagsPayload.recording_window_days = nextWindow;
      }

      const hasFlags = Object.keys(flagsPayload).length > 0;

      if (!hasFlags) {
        onToast?.("Sin cambios", "warning");
        setEditLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/user/${editTarget.id}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(flagsPayload)
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error actualizando flags");
      }

      onToast?.("Usuario actualizado", "success");
      setEditTarget(null);
      setEditForm(null);
      loadSafe({ reset: true });
    } catch (error) {
      onToast?.(error.message || "Error actualizando usuario", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleResetQuota = async (type) => {
    if (!editTarget) return;

    const payload = {
      reset_stylize: type === "stylize",
      reset_recording: type === "recording"
    };

    try {
      const res = await fetch(`/api/admin/user/${editTarget.id}/quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error reseteando cuota");
      }
      setQuotaResetResult({
        type,
        message:
          type === "stylize"
            ? "Cuota de stylize reseteada correctamente"
            : "Cuota de grabación reseteada correctamente"
      });
      loadSafe({ reset: true });
    } catch (error) {
      onToast?.(error.message || "Error reseteando cuota", "error");
    }
  };

  const openConfirm = (config) => {
    setConfirmAction(config);
  };

  const handleConfirm = async () => {
    if (!confirmAction?.onConfirm) return;
    await confirmAction.onConfirm();
    setConfirmAction(null);
  };

  const statusBadge = (user) => {
    if (!user.is_active) {
      return "Inactivo";
    }
    return "Activo";
  };

  const stylizeQuota = (user) => {
    const used = user.stylizes_used_in_window ?? 0;
    const limitValue = user.daily_stylize_quota ?? "Sin límite";
    return `${used} / ${limitValue}`;
  };

  const recordingQuota = (user) => {
    const usedMinutes = user.recording_seconds_used
      ? Math.round(user.recording_seconds_used / 60)
      : 0;
    const limitValue = user.recording_minutes_quota ?? "Sin límite";
    return `${usedMinutes} / ${limitValue} min`;
  };

  const getEditStylizeUsed = () => {
    if (!editTarget) return 0;
    return editTarget.stylizes_used_in_window ?? 0;
  };

  const getEditStylizeLimit = () => {
    if (!editTarget) return "Sin límite";
    return editTarget.daily_stylize_quota ?? "Sin límite";
  };

  const getEditRecordingUsed = () => {
    if (!editTarget) return 0;
    const seconds = editTarget.recording_seconds_used ?? 0;
    return Math.round(seconds / 60);
  };

  const getEditRecordingLimit = () => {
    if (!editTarget) return "Sin límite";
    return editTarget.recording_minutes_quota ?? "Sin límite";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-accent">Usuarios</h1>
          <p className="text-sm text-text-muted">Gestión de cuentas y cuotas</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
        >
          Crear usuario
        </button>
      </div>

      <form onSubmit={onApplyFilters} className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Buscar usuario"
          className="w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-4 py-2 text-sm text-text-primary"
        />
        <select
          value={limitInput}
          onChange={(event) => setLimitInput(event.target.value)}
          className="w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-4 py-2 text-sm text-text-primary md:w-40"
        >
          {LIMIT_OPTIONS.map((value) => (
            <option key={value} value={String(value)}>
              {value} por página
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-light"
        >
          Buscar
        </button>
      </form>

      <div className="rounded-2xl border border-white/10 bg-bg-surface/80 p-5 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-text-muted">
              <tr>
                <th className="pb-3 text-left">Usuario</th>
                <th className="pb-3 text-left">Estado</th>
                <th className="pb-3 text-left">Cuotas</th>
                <th className="pb-3 text-left">Último login</th>
                <th className="pb-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {items.map((user) => (
                <tr key={user.id} className="border-t border-bg-surface-light/60">
                  <td className="py-3 pr-4">
                    <div className="text-sm font-semibold text-text-primary">{user.username}</div>
                    {user.is_admin ? (
                      <span className="mt-1 inline-flex rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        Admin
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        user.is_active
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-error/40 bg-error/10 text-error"
                      }`}
                    >
                      {statusBadge(user)}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="text-xs">
                      <div>Stylize: {stylizeQuota(user)}</div>
                      <div>Grabación: {recordingQuota(user)}</div>
                      <div>Ventana: {user.recording_window_days ?? "--"} días</div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs">{formatDateTime(user.last_login_at)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-bg-surface-light bg-bg-surface-light/30 px-3 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                        onClick={() => {
                          setResetTarget(user);
                          setResetResult(null);
                        }}
                      >
                        Reset contraseña
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-bg-surface-light bg-bg-surface-light/30 px-3 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                        onClick={() => openEdit(user)}
                      >
                        Editar cuotas
                      </button>
                      {user.is_active ? (
                        <button
                          type="button"
                          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent"
                          onClick={() =>
                            openConfirm({
                              title: "Desactivar usuario",
                              message: `¿Quieres desactivar a ${user.username}?`,
                              confirmLabel: "Desactivar",
                              onConfirm: async () => {
                                const res = await fetch(
                                  `/api/admin/user/${user.id}/deactivate`,
                                  {
                                    method: "POST",
                                    credentials: "include"
                                  }
                                );
                                const data = await res.json();
                                if (!data.ok) {
                                  onToast?.(
                                    data.error || "Error desactivando usuario",
                                    "error"
                                  );
                                  return;
                                }
                                onToast?.("Usuario desactivado", "success");
                                loadSafe({ reset: true });
                              }
                            })
                          }
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md border border-success/40 bg-success/10 px-3 py-1 text-[11px] font-semibold text-success"
                          onClick={() =>
                            openConfirm({
                              title: "Activar usuario",
                              message: `¿Quieres activar a ${user.username}?`,
                              confirmLabel: "Activar",
                              onConfirm: async () => {
                                const res = await fetch(
                                  `/api/admin/user/${user.id}/activate`,
                                  {
                                    method: "POST",
                                    credentials: "include"
                                  }
                                );
                                const data = await res.json();
                                if (!data.ok) {
                                  onToast?.(
                                    data.error || "Error activando usuario",
                                    "error"
                                  );
                                  return;
                                }
                                onToast?.("Usuario activado", "success");
                                loadSafe({ reset: true });
                              }
                            })
                          }
                        >
                          Activar
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-md border border-error/40 bg-error/10 px-3 py-1 text-[11px] font-semibold text-error"
                        onClick={() =>
                          openConfirm({
                            title: "Eliminar usuario",
                            message: `¿Quieres eliminar a ${user.username}?`,
                            confirmLabel: "Eliminar",
                            onConfirm: async () => {
                              const res = await fetch(`/api/admin/user/${user.id}`, {
                                method: "DELETE",
                                credentials: "include"
                              });
                              const data = await res.json();
                              if (!data.ok) {
                                onToast?.(
                                  data.error || "Error eliminando usuario",
                                  "error"
                                );
                                return;
                              }
                              onToast?.("Usuario eliminado", "success");
                              loadSafe({ reset: true });
                            }
                          })
                        }
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-text-muted">
                    No hay usuarios
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {loading ? <p className="mt-4 text-sm text-text-muted">Cargando...</p> : null}
        {canLoadMore && !loading ? (
          <button
            type="button"
            onClick={() => loadSafe({ reset: false })}
            className="mt-4 w-full rounded-xl border border-bg-surface-light px-4 py-3 text-sm font-semibold text-text-secondary hover:border-accent"
          >
            Cargar más
          </button>
        ) : null}
      </div>

      {/* Modal Crear Usuario */}
      <Modal open={createOpen && !createResult} title="Crear usuario" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-text-muted">
              Username
              <input
                value={createForm.username}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, username: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="text-xs text-text-muted">
              Ventana de grabación (días)
              <input
                type="number"
                value={createForm.recording_window_days}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    recording_window_days: event.target.value
                  }))
                }
                className="mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="text-xs text-text-muted">
              Minutos de grabación
              <input
                type="number"
                value={createForm.recording_minutes_quota}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    recording_minutes_quota: event.target.value
                  }))
                }
                className="mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="text-xs text-text-muted">
              Cuota diaria stylize
              <input
                type="number"
                value={createForm.can_stylize_images ? createForm.daily_stylize_quota : "0"}
                disabled={!createForm.can_stylize_images}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    daily_stylize_quota: event.target.value
                  }))
                }
                className={`mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary ${
                  !createForm.can_stylize_images ? "cursor-not-allowed opacity-50" : ""
                }`}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-3">
              <Switch
                checked={createForm.is_active}
                onChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, is_active: value }))
                }
              />
              <span className="text-xs text-text-secondary">Activo</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={createForm.can_stylize_images}
                onChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    can_stylize_images: value,
                    daily_stylize_quota: value ? prev.daily_stylize_quota : ""
                  }))
                }
              />
              <span className="text-xs text-text-secondary">Puede estilizar imágenes</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={createLoading}
              className="rounded-lg border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
            >
              {createLoading ? "Creando..." : "Crear"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Éxito Crear Usuario */}
      <Modal
        open={createOpen && Boolean(createResult)}
        title="Usuario creado"
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Usuario <span className="font-semibold text-text-primary">{createResult?.user?.username}</span> creado correctamente.
          </p>
          <PasswordDisplay password={createResult?.temp_password} onToast={onToast} />
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
              className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={resetCreateForm}
              className="rounded-lg border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
            >
              Crear otro
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Reset Contraseña */}
      <Modal
        open={Boolean(resetTarget)}
        title={resetResult ? "Contraseña reseteada" : "Reset contraseña"}
        onClose={() => {
          setResetTarget(null);
          setResetResult(null);
        }}
      >
        <div className="space-y-4 text-sm text-text-secondary">
          {!resetResult ? (
            <>
              <p>Se generará una nueva contraseña para <span className="font-semibold text-text-primary">{resetTarget?.username}</span>.</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setResetTarget(null);
                    setResetResult(null);
                  }}
                  className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                  className="rounded-lg border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
                >
                  {resetLoading ? "Reseteando..." : "Confirmar"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Contraseña de <span className="font-semibold text-text-primary">{resetResult.user?.username}</span> reseteada correctamente.</p>
              <PasswordDisplay password={resetResult.temp_password} onToast={onToast} />
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setResetTarget(null);
                    setResetResult(null);
                  }}
                  className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal Editar Usuario */}
      <Modal
        open={Boolean(editTarget) && !quotaResetResult}
        title={`Editar usuario: ${editTarget?.username || ""}`}
        onClose={() => {
          setEditTarget(null);
          setEditForm(null);
        }}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5">
          {/* Configuración */}
          <div className="rounded-xl border border-white/10 bg-bg-surface-light/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Configuración
            </p>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Puede estilizar imágenes</span>
                <Switch
                  checked={Boolean(editForm?.can_stylize_images)}
                  onChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      can_stylize_images: value,
                      daily_stylize_quota: value ? prev.daily_stylize_quota : 0
                    }))
                  }
                />
              </div>
              <label className="text-xs text-text-muted">
                Ventana de grabación (días)
                <input
                  type="number"
                  value={editForm?.recording_window_days ?? ""}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      recording_window_days: event.target.value
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary"
                />
              </label>
            </div>
          </div>

          {/* Cuota Stylize */}
          <div className="rounded-xl border border-white/10 bg-bg-surface-light/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Cuota Stylize
            </p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Usado / Total:</span>
                <span className="font-semibold text-text-primary">
                  {getEditStylizeUsed()} / {getEditStylizeLimit()}
                </span>
              </div>
              <label className="text-xs text-text-muted">
                Cuota diaria
                <input
                  type="number"
                  value={editForm?.can_stylize_images ? (editForm?.daily_stylize_quota ?? "") : "0"}
                  disabled={!editForm?.can_stylize_images}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      daily_stylize_quota: event.target.value
                    }))
                  }
                  className={`mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary ${
                    !editForm?.can_stylize_images ? "cursor-not-allowed opacity-50" : ""
                  }`}
                />
              </label>
              <button
                type="button"
                disabled={!editForm?.can_stylize_images}
                onClick={() => handleResetQuota("stylize")}
                className={`w-full rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent ${
                  !editForm?.can_stylize_images
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-accent/20"
                }`}
              >
                Reset stylize
              </button>
            </div>
          </div>

          {/* Cuota Grabación */}
          <div className="rounded-xl border border-white/10 bg-bg-surface-light/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Cuota Grabación
            </p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Usado / Total:</span>
                <span className="font-semibold text-text-primary">
                  {getEditRecordingUsed()} min / {getEditRecordingLimit()} min
                </span>
              </div>
              <label className="text-xs text-text-muted">
                Minutos de grabación
                <input
                  type="number"
                  value={editForm?.recording_minutes_quota ?? ""}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      recording_minutes_quota: event.target.value
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <button
                type="button"
                onClick={() => handleResetQuota("recording")}
                className="w-full rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/20"
              >
                Reset grabación
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditTarget(null);
                setEditForm(null);
              }}
              className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={editLoading}
              className="rounded-lg border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
            >
              {editLoading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Éxito Reset Cuota */}
      <Modal
        open={Boolean(quotaResetResult)}
        title="Cuota reseteada"
        onClose={() => setQuotaResetResult(null)}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3">
            <p className="text-sm text-text-primary">{quotaResetResult?.message}</p>
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setQuotaResetResult(null)}
              className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmación */}
      <Modal
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        onClose={() => setConfirmAction(null)}
      >
        <div className="space-y-4 text-sm text-text-secondary">
          <p>{confirmAction?.message}</p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-xs font-semibold text-error"
            >
              {confirmAction?.confirmLabel || "Confirmar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
