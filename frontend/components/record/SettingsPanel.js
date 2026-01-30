"use client";

import { ClockIcon, SparklesIcon, UserIcon, XMarkIcon, RectangleStackIcon } from "@heroicons/react/24/solid";

export default function SettingsPanel({
  open,
  photoDelay,
  onDelayMinus,
  onDelayPlus,
  stylize,
  stylizeAllowed = true,
  onStylizeToggle,
  fullScreenMode,
  onFullScreenToggle,
  onClose,
  participantName,
  onParticipantNameChange,
  highlightName
}) {
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
      <div className="w-full max-w-md rounded-2xl border border-bg-surface-light bg-bg-surface/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">Configuración</h3>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-bg-surface-light text-text-secondary"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <UserIcon className="h-5 w-5 text-text-secondary" />
            <input
              value={participantName || ""}
              onChange={(e) => onParticipantNameChange?.(e.target.value)}
              placeholder="Nombre"
              maxLength={20}
              className={`flex-1 rounded-full border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${
                highlightName
                  ? "bg-white/30 border-white"
                  : "bg-bg-surface-light border-bg-surface-light"
              }`}
            />
          </div>
          <div className="flex items-center gap-3">
            <ClockIcon className="h-5 w-5 text-text-secondary" />
            <button
              type="button"
              onClick={onDelayMinus}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-bg-surface-light text-text-secondary"
            >
              −
            </button>
            <span className="text-sm text-text-primary">{photoDelay}</span>
            <button
              type="button"
              onClick={onDelayPlus}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-bg-surface-light text-text-secondary"
            >
              +
            </button>
            <span className="text-xs text-text-muted">Timer (seg)</span>
          </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SparklesIcon className="h-5 w-5 text-text-secondary" />
                <span className="text-sm text-text-secondary">Estilizar como dibujo</span>
              </div>
              <button
                type="button"
                onClick={stylizeAllowed ? onStylizeToggle : undefined}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  stylize && stylizeAllowed ? "bg-accent" : "bg-bg-surface-light"
                } ${!stylizeAllowed ? "cursor-not-allowed opacity-60" : ""}`}
                aria-pressed={stylize && stylizeAllowed}
                aria-disabled={!stylizeAllowed}
                disabled={!stylizeAllowed}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    stylize && stylizeAllowed ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {/* Detectar si estamos en móvil para mostrar toggle de pantalla completa */}
            <div className="lg:hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RectangleStackIcon className="h-5 w-5 text-text-secondary" />
                  <span className="text-sm text-text-secondary">Pantalla completa</span>
                </div>
                <button
                  type="button"
                  onClick={onFullScreenToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    fullScreenMode ? "bg-accent" : "bg-bg-surface-light"
                  }`}
                  aria-pressed={fullScreenMode}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                      fullScreenMode ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
