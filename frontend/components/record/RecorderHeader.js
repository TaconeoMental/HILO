"use client";

export default function RecorderHeader({
  projectName,
  onProjectNameChange,
  statusLabel,
  timerLabel,
  status
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-bg-surface-light/80 bg-bg-primary/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input
            value={projectName}
            onChange={(event) => onProjectNameChange(event.target.value)}
            placeholder="Sin título"
            className="w-52 bg-transparent text-lg font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
            maxLength={50}
            disabled={status !== "stopped"}
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{statusLabel}</span>
          <span className="rounded-full border border-bg-surface-light px-3 py-1 text-text-secondary">
            {timerLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
