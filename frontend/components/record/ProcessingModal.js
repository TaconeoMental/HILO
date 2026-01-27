"use client";

export default function ProcessingModal({ open, message = "Terminando de procesar audio..." }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-bg-surface-light bg-bg-surface p-6 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        <p className="text-sm font-medium text-text-primary">{message}</p>
        <p className="mt-2 text-xs text-text-muted">Por favor espera...</p>
      </div>
    </div>
  );
}
