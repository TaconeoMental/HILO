"use client";

import { XMarkIcon } from "@heroicons/react/24/solid";

export default function NoMinutesModal({ open, title, subtitle, countdown, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-bg-surface-light bg-bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
        {countdown ? (
          <div className="mt-4 text-sm text-text-secondary">{countdown}</div>
        ) : null}
        <div className="mt-6">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-bg-surface-light px-4 py-3 text-sm font-semibold text-text-secondary"
            onClick={onClose}
          >
            <XMarkIcon className="h-5 w-5" />
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
