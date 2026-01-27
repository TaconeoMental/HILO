"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/common/Modal";
import { useAdminAudit } from "@/hooks/admin/useAdminAudit";

const LIMIT_OPTIONS = [10, 25, 50];

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-ES");
}

export default function AuditPanel({ onToast }) {
  const { items, total, limit, loading, load, applyFilters } = useAdminAudit();
  const [queryInput, setQueryInput] = useState("");
  const [limitInput, setLimitInput] = useState(String(limit));
  const [detailTarget, setDetailTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const canLoadMore = items.length < total;

  const loadSafe = useCallback(
    async (options = {}) => {
      try {
        await load(options);
      } catch (error) {
        onToast?.(error.message || "Error cargando auditoría", "error");
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

  const detailPayload = useMemo(() => {
    if (!detailTarget) return "";
    try {
      return JSON.stringify(detailTarget.details || {}, null, 2);
    } catch (error) {
      return "{}";
    }
  }, [detailTarget]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-accent">Auditoría</h1>
        <p className="text-sm text-text-muted">Eventos y trazabilidad</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <button
          type="button"
          className="rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-xs font-semibold text-error"
          onClick={() =>
            openConfirm({
              title: "Borrar logs",
              message: "¿Quieres borrar todos los logs de auditoría?",
              confirmLabel: "Borrar logs",
              onConfirm: async () => {
                const res = await fetch("/api/admin/audit/clear", {
                  method: "POST",
                  credentials: "include"
                });
                const data = await res.json();
                if (!data.ok) {
                  onToast?.(data.error || "Error borrando logs", "error");
                  return;
                }
                onToast?.("Logs borrados", "success");
                loadSafe({ reset: true });
              }
            })
          }
        >
          Borrar logs
        </button>
        <button
          type="button"
          className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
          onClick={() =>
            openConfirm({
              title: "Limpiar eventos",
              message: "¿Quieres limpiar eventos con más de 90 días?",
              confirmLabel: "Limpiar eventos",
              onConfirm: async () => {
                const res = await fetch("/api/admin/cleanup-events", {
                  method: "POST",
                  credentials: "include"
                });
                const data = await res.json();
                if (!data.ok) {
                  onToast?.(data.error || "Error limpiando eventos", "error");
                  return;
                }
                onToast?.("Eventos limpiados", "success");
                loadSafe({ reset: true });
              }
            })
          }
        >
          Limpiar eventos (90 días)
        </button>
      </div>

      <form onSubmit={onApplyFilters} className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Buscar por acción, IP o usuario"
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
                <th className="pb-3 text-left">Fecha</th>
                <th className="pb-3 text-left">Acción</th>
                <th className="pb-3 text-left">Actor</th>
                <th className="pb-3 text-left">Target</th>
                <th className="pb-3 text-left">Detalles</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {items.map((entry) => (
                <tr key={entry.id} className="border-t border-bg-surface-light/60">
                  <td className="py-3 pr-4 text-xs">{formatDateTime(entry.created_at)}</td>
                  <td className="py-3 pr-4 text-xs text-text-primary">{entry.action}</td>
                  <td className="py-3 pr-4 text-xs">
                    {entry.actor_username || entry.actor_user_id || "--"}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {entry.target_username || entry.target_user_id || "--"}
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      className="rounded-md border border-bg-surface-light bg-bg-surface-light/30 px-3 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                      onClick={() => setDetailTarget(entry)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-text-muted">
                    No hay logs
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

      <Modal open={Boolean(detailTarget)} title="Detalles" onClose={() => setDetailTarget(null)}>
        <div className="rounded-xl border border-white/10 bg-bg-primary/80 p-4">
          <pre className="max-h-80 overflow-auto text-xs text-text-secondary">{detailPayload}</pre>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setDetailTarget(null)}
            className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
          >
            Cerrar
          </button>
        </div>
      </Modal>

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
