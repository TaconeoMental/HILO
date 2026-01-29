"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, ArrowPathIcon, Cog6ToothIcon } from "@heroicons/react/24/solid";
import VideoCanvas from "./VideoCanvas";

export default function Preview({
  videoRef,
  canvasRef,
  stream,
  facingMode,
  showPreview,
  canvasReady,
  mirrored,
  onCapturePhoto,
  captureDisabled,
  onSwitchCamera,
  participantName,
  onParticipantNameChange,
  status,
  onOpenSettings,
  statusLabel,
  registerCaptureHandler
}) {
  const isEditable = status === "stopped";
  const [isEditing, setIsEditing] = useState(false);
  const [flash, setFlash] = useState(false);
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

  const handleCapture = useCallback(() => {
    if (captureDisabled) return;

    // Flash doble rapido: on-off-on-off en 300ms
    setFlash(true);
    setTimeout(() => setFlash(false), 75);
    setTimeout(() => setFlash(true), 150);
    setTimeout(() => setFlash(false), 225);

    onCapturePhoto();
  }, [captureDisabled, onCapturePhoto]);

  useEffect(() => {
    if (!registerCaptureHandler) return;
    registerCaptureHandler(handleCapture);
    return () => registerCaptureHandler(null);
  }, [registerCaptureHandler, handleCapture]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-bg-surface-light bg-black">
      <div className="aspect-video w-full lg:aspect-auto lg:flex-1 bg-black" aria-hidden={!showPreview}>
        {showPreview ? (
          <VideoCanvas
            stream={stream}
            facingMode={facingMode}
            orientation="portrait"
            fullScreen={false}
            className="h-full w-full"
            videoRef={videoRef}
            canvasRef={canvasRef}
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
      </div>

      <div
        className={`pointer-events-none absolute inset-0 bg-white ${
          flash ? "opacity-90" : "opacity-0"
        }`}
      />

      <button
        type="button"
        onClick={handleCapture}
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

      {/* Status y settings - esquina superior derecha */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {statusLabel && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status === "recording" ? "bg-red-500 text-white" :
            status === "paused" ? "bg-yellow-500 text-black" :
            "bg-white/20 text-white"
          }`}>
            {statusLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-bg-surface-light bg-bg-surface/80 text-text-primary transition hover:border-accent"
          title="Configuración"
        >
          <Cog6ToothIcon className="h-5 w-5" />
        </button>
      </div>

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

    </div>
  );
}
