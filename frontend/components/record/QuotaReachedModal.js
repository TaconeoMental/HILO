"use client";

import { CheckCircleIcon, TrashIcon } from "@heroicons/react/24/solid";

export default function QuotaReachedModal({
  open,
  countdown,
  hasReset,
  noResetMessage,
  onSave,
  onDiscard
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-bg-surface-light bg-bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          Cuota de grabación alcanzada
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Has alcanzado tu límite de tiempo de grabación.
        </p>

        {hasReset && countdown ? (
          <div className="mt-3 rounded-lg bg-bg-surface-light px-3 py-2 text-sm text-text-secondary">
            {countdown}
          </div>
        ) : !hasReset ? (
          <div className="mt-3 rounded-lg bg-bg-surface-light px-3 py-2 text-sm text-text-secondary">
            {noResetMessage}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-light"
            onClick={onSave}
          >
            <CheckCircleIcon className="h-5 w-5" />
            Guardar grabación
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-lg border border-error/70 px-4 py-3 text-sm font-semibold text-error"
            onClick={onDiscard}
          >
            <TrashIcon className="h-5 w-5" />
            Descartar grabación
          </button>
        </div>
      </div>
    </div>
  );
}
