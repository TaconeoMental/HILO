"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/common/Modal";
import { useAdminSessions } from "@/hooks/admin/useAdminSessions";

const LIMIT_OPTIONS = [10, 25, 50];

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-ES");
}

export default function SessionsPanel({ onToast }) {
  const { items, total, limit, loading, load, applyFilters } = useAdminSessions();
  const [queryInput, setQueryInput] = useState("");
  const [limitInput, setLimitInput] = useState(String(limit));
  const [confirmAction, setConfirmAction] = useState(null);

  const canLoadMore = items.length < total;

  const loadSafe = useCallback(
    async (options = {}) => {
      try {
        await load(options);
      } catch (error) {
        onToast?.(error.message || "Error cargando sesiones", "error");
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

  const openConfirm = (config) => {
    setConfirmAction(config);
  };

  const handleConfirm = async () => {
    if (!confirmAction?.onConfirm) return;
    await confirmAction.onConfirm();
    setConfirmAction(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-accent">Sesiones</h1>
        <p className="text-sm text-text-muted">Sesiones activas y revocación</p>
      </div>

      <form onSubmit={onApplyFilters} className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Buscar por usuario o IP"
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
                <th className="pb-3 text-left">Última actividad</th>
                <th className="pb-3 text-left">IP</th>
                <th className="pb-3 text-left">Estado</th>
                <th className="pb-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {items.map((session) => (
                <tr key={session.id} className="border-t border-bg-surface-light/60">
                  <td className="py-3 pr-4">
                    <div className="text-sm font-semibold text-text-primary">
                      {session.username}
                    </div>
                    <div className="text-xs text-text-muted">{session.user_id}</div>
                  </td>
                  <td className="py-3 pr-4 text-xs">{formatDateTime(session.last_seen_at)}</td>
                  <td className="py-3 pr-4 text-xs">{session.ip || "--"}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        session.is_connected
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-bg-surface-light text-text-muted"
                      }`}
                    >
                      {session.is_connected ? "Conectado" : "Inactivo"}
                    </span>
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      className="rounded-md border border-error/40 bg-error/10 px-3 py-1 text-[11px] font-semibold text-error"
                      onClick={() =>
                        openConfirm({
                          title: "Revocar sesión",
                          message: `¿Quieres revocar la sesión de ${session.username}?`,
                          confirmLabel: "Revocar",
                          onConfirm: async () => {
                            const res = await fetch(
                              `/api/admin/sessions/${session.id}/revoke`,
                              {
                                method: "POST",
                                credentials: "include"
                              }
                            );
                            const data = await res.json();
                            if (!data.ok) {
                              onToast?.(
                                data.error || "Error revocando sesión",
                                "error"
                              );
                              return;
                            }
                            onToast?.("Sesión revocada", "success");
                            loadSafe({ reset: true });
                          }
                        })
                      }
                    >
                      Revocar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-text-muted">
                    No hay sesiones
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
