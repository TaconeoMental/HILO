"use client";

import { CheckCircleIcon, PlayCircleIcon, TrashIcon } from "@heroicons/react/24/solid";

export default function StopModal({ open, onFinish, onDiscard, onContinue }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-bg-surface-light bg-bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">¿Qué quieres hacer?</h2>
        <p className="mt-2 text-sm text-text-muted">La grabación está pausada</p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-light"
            onClick={onFinish}
          >
            <CheckCircleIcon className="h-5 w-5" />
            Finalizar y procesar
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-lg border border-error/70 px-4 py-3 text-sm font-semibold text-error"
            onClick={onDiscard}
          >
            <TrashIcon className="h-5 w-5" />
            Descartar grabación
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-lg border border-bg-surface-light px-4 py-3 text-sm font-semibold text-text-secondary"
            onClick={onContinue}
          >
            <PlayCircleIcon className="h-5 w-5" />
            Continuar grabando
          </button>
        </div>
      </div>
    </div>
  );
}
