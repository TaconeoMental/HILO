"use client";

export default function Modal({ open, title, children, onClose, maxWidth = "max-w-xl" }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div className={`w-full ${maxWidth} rounded-2xl border border-white/10 bg-bg-surface px-6 py-5 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Cerrar
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
