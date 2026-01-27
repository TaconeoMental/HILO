"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayCircleIcon,
  TrashIcon
} from "@heroicons/react/24/solid";

export default function StopModal({ open, onFinish, onDiscard, onContinue }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (!open) return null;

  const handleDiscardClick = () => {
    setConfirmingDiscard(true);
  };

  const handleConfirmDiscard = () => {
    setConfirmingDiscard(false);
    onDiscard?.();
  };

  const handleCancelDiscard = () => {
    setConfirmingDiscard(false);
  };

  // Vista de confirmación de descarte
  if (confirmingDiscard) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-bg-surface-light bg-bg-surface p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
            <ExclamationTriangleIcon className="h-6 w-6 text-error" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">¿Estás seguro?</h2>
          <p className="mt-2 text-sm text-text-muted">
            Esta acción eliminará la grabación permanentemente. No podrás recuperarla.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              className="flex items-center justify-center gap-2 rounded-lg bg-error px-4 py-3 text-sm font-semibold text-white hover:bg-error/90"
              onClick={handleConfirmDiscard}
            >
              <TrashIcon className="h-5 w-5" />
              Sí, descartar grabación
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded-lg border border-bg-surface-light px-4 py-3 text-sm font-semibold text-text-secondary"
              onClick={handleCancelDiscard}
            >
              <ArrowLeftIcon className="h-5 w-5" />
              No, volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Vista principal de opciones
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
            onClick={handleDiscardClick}
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
