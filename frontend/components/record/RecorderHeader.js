"use client";

import Link from "next/link";
import { FolderIcon } from "@heroicons/react/24/solid";

export default function RecorderHeader({
  projectName,
  onProjectNameChange,
  statusLabel,
  timerLabel,
  status
}) {
  return (
    <header className="shrink-0 z-40 border-b border-bg-surface-light/80 bg-bg-primary/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm lg:text-xl font-semibold tracking-[0.3em] text-accent">HILO</span>
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
          <Link
            href="/projects"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-bg-surface-light text-text-secondary hover:border-accent hover:text-accent-light"
            title="Proyectos"
          >
            <FolderIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
