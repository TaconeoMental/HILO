"use client";

const TYPE_STYLES = {
  success: "border-success/40 text-success",
  error: "border-error/50 text-error",
  warning: "border-warning/50 text-warning",
  info: "border-bg-surface-light text-text-secondary"
};

export default function ToastList({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed right-6 top-24 z-50 flex w-[320px] max-w-[90vw] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start justify-between rounded-xl border bg-bg-surface/95 px-4 py-3 shadow-xl transition-opacity duration-300 ${
            toast.visible ? "opacity-100" : "opacity-0"
          } ${TYPE_STYLES[toast.type] || TYPE_STYLES.info}`}
        >
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-4 text-xs text-text-muted hover:text-text-primary"
            type="button"
            aria-label="Cerrar"
          >
            X
          </button>
        </div>
      ))}
    </div>
  );
}
