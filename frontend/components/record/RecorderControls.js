"use client";

import { PlayIcon, PauseIcon, StopIcon } from "@heroicons/react/24/solid";

export default function RecorderControls({
  status,
  onStart,
  onStop,
  onPause,
  onResume
}) {
  const isRecording = status === "recording";
  const isPaused = status === "paused";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!isRecording && !isPaused ? (
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-accent/40 hover:bg-accent-light"
        >
          <PlayIcon className="h-4 w-4" />
          START
        </button>
      ) : (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex items-center gap-2 rounded-full border border-error/70 px-5 py-2 text-xs font-semibold text-error"
        >
          <StopIcon className="h-4 w-4" />
          STOP
        </button>
      )}

      {isRecording ? (
        <button
          type="button"
          onClick={onPause}
          className="inline-flex items-center gap-2 rounded-full border border-bg-surface-light px-5 py-2 text-xs font-semibold text-text-secondary"
        >
          <PauseIcon className="h-4 w-4" />
          PAUSA
        </button>
      ) : null}
      {isPaused ? (
        <button
          type="button"
          onClick={onResume}
          className="inline-flex items-center gap-2 rounded-full border border-bg-surface-light px-5 py-2 text-xs font-semibold text-text-secondary"
        >
          <PlayIcon className="h-4 w-4" />
          CONTINUAR
        </button>
      ) : null}
    </div>
  );
}
