"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, ArrowPathIcon, Cog6ToothIcon } from "@heroicons/react/24/solid";

export default function Preview({
  videoRef,
  canvasRef,
  showPreview,
  canvasReady,
  mirrored,
  onCapturePhoto,
  captureDisabled,
  onSwitchCamera,
  showMobileTimer,
  mobileTimerLabel,
  participantName,
  onParticipantNameChange,
  status,
  onOpenSettings
}) {
  const isEditable = status === "stopped";
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditable) {
      setIsEditing(false);
    }
  }, [isEditable]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-bg-surface-light bg-black">
      <div className="aspect-video w-full bg-black" aria-hidden={!showPreview}>
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""} ${showPreview ? "block" : "hidden"}`}
          autoPlay
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full ${showPreview && canvasReady ? "block" : "hidden"}`}
        />
        {!showPreview ? (
          <div className="absolute inset-0 bg-black" />
        ) : null}
      </div>

      <button
        type="button"
        onClick={onCapturePhoto}
        disabled={captureDisabled}
        className="absolute bottom-4 left-1/2 inline-flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border border-bg-surface-light bg-bg-surface/80 text-text-primary transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        title="Tomar foto"
      >
        <CameraIcon className="h-7 w-7" />
      </button>

      <button
        type="button"
        onClick={onSwitchCamera}
        className="absolute bottom-4 left-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-bg-surface-light bg-bg-surface/80 text-text-primary transition hover:border-accent lg:hidden"
        title="Cambiar cámara"
      >
        <ArrowPathIcon className="h-6 w-6" />
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-bg-surface-light bg-bg-surface/80 text-text-primary transition hover:border-accent"
        title="Configuración"
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-20 lg:left-4">
        {isEditable && isEditing ? (
          <input
            ref={inputRef}
            value={participantName}
            onChange={(event) => onParticipantNameChange(event.target.value)}
            placeholder="Nombre"
            maxLength={20}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setIsEditing(false);
              }
            }}
            size={Math.max((participantName || "Nombre").length, 6)}
            className="min-w-[72px] rounded-full border border-accent/60 bg-accent px-3 py-1 text-xs font-semibold text-white placeholder:text-white/70 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (isEditable) setIsEditing(true);
            }}
            className="inline-flex items-center rounded-full border border-accent/60 bg-accent px-3 py-1 text-xs font-semibold text-white"
          >
            {participantName || "Nombre"}
          </button>
        )}
      </div>

      {showMobileTimer ? (
        <div className="absolute bottom-4 right-4 rounded-full border border-bg-surface-light bg-bg-surface/80 px-4 py-2 text-sm text-text-secondary">
          {mobileTimerLabel}
        </div>
      ) : null}
    </div>
  );
}
