"use client";

import { CheckCircleIcon } from "@heroicons/react/24/solid";

export default function DiscardedModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-bg-surface-light bg-bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircleIcon className="h-6 w-6 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Grabación descartada</h2>
        <p className="mt-2 text-sm text-text-muted">
          La grabación ha sido eliminada exitosamente.
        </p>
        <div className="mt-6">
          <button
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-light"
            onClick={onClose}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
