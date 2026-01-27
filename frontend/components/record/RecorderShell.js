"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  CameraIcon,
  Cog6ToothIcon,
  FolderIcon,
  PauseIcon,
  PlayIcon,
  StopIcon
} from "@heroicons/react/24/solid";
import RecorderHeader from "./RecorderHeader";
import ToastList from "@/components/common/ToastList";
import Preview from "./Preview";
import RecorderControls from "./RecorderControls";
import SettingsPanel from "./SettingsPanel";
import StopModal from "./StopModal";
import NoMinutesModal from "./NoMinutesModal";
import ProcessingModal from "./ProcessingModal";
import DiscardedModal from "./DiscardedModal";
import QuotaReachedModal from "./QuotaReachedModal";
import { useRecorder } from "@/hooks/recording/useRecorder";
import VideoCanvas from "./VideoCanvas";

export default function RecorderShell() {
  const router = useRouter();
  const recorder = useRecorder();
  const [toasts, setToasts] = useState([]);
  const [nameFlash, setNameFlash] = useState(false);
  const { setToastHandler } = recorder;

  // Handler para finalizar y navegar a proyectos
  const handleFinish = useCallback(async () => {
    const result = await recorder.stop();
    if (result?.ok) {
      // Navegar a la página de proyectos después de procesar
      router.push("/projects");
    }
  }, [recorder, router]);

  // Handler para cerrar modal de descartado y navegar
  const handleDiscardedClose = useCallback(() => {
    recorder.closeDiscardedModal();
    router.push("/projects");
  }, [recorder, router]);

  // Handler para guardar desde modal de cuota alcanzada
  const handleSaveFromQuota = useCallback(async () => {
    recorder.closeQuotaReached();
    const result = await recorder.stop();
    if (result?.ok) {
      router.push("/projects");
    }
  }, [recorder, router]);

  // Handler para descartar desde modal de cuota alcanzada
  const handleDiscardFromQuota = useCallback(async () => {
    recorder.closeQuotaReached();
    await recorder.discard();
  }, [recorder]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (recorder.canCapturePhoto) {
        event.preventDefault();
        recorder.capturePhoto();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recorder.canCapturePhoto, recorder.capturePhoto]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, visible: false } : toast))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 300);
  }, []);

  const addToast = useCallback((message, type = "error") => {
    const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    setToasts((prev) => [...prev, { id, message, type, visible: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((toast) => (toast.id === id ? { ...toast, visible: true } : toast))
      );
    }, 10);
    setTimeout(() => {
      dismissToast(id);
    }, 4000);
  }, [dismissToast]);

  useEffect(() => {
    setToastHandler(addToast);
  }, [setToastHandler, addToast]);

  return (
    <>
      <div className="hidden min-h-screen bg-bg-primary text-text-primary lg:block">
        <RecorderHeader
          projectName={recorder.projectName}
          onProjectNameChange={recorder.setProjectName}
          statusLabel={recorder.statusLabel}
          timerLabel={recorder.timerLabel}
          status={recorder.status}
        />

        <main className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-5xl flex-col gap-4 px-4 pb-6 pt-4">
          <section className="flex flex-col gap-4">
            <Preview
              videoRef={recorder.videoRef}
              canvasRef={recorder.canvasRef}
              stream={recorder.stream}
              facingMode={recorder.facingMode}
              showPreview={recorder.showPreview}
              canvasReady={recorder.canvasReady}
              mirrored={recorder.isMirrored}
              onCapturePhoto={recorder.capturePhoto}
              captureDisabled={!recorder.canCapturePhoto}
              onSwitchCamera={recorder.switchCamera}
              showMobileTimer={recorder.showPreview}
              mobileTimerLabel={recorder.timerLabel}
              participantName={recorder.participantName}
              onParticipantNameChange={recorder.setParticipantName}
              status={recorder.status}
              onOpenSettings={recorder.toggleSettings}
            />

            <div className="rounded-2xl border border-bg-surface-light bg-bg-surface/60 p-4">
              <RecorderControls
                status={recorder.status}
                onStart={recorder.start}
                onStop={recorder.requestStop}
                onPause={recorder.pause}
                onResume={recorder.resume}
              />
            </div>
          </section>
        </main>
      </div>

      <MobileRecorder
        recorder={recorder}
        className="lg:hidden"
        nameFlash={nameFlash}
        setNameFlash={setNameFlash}
      />

      <StopModal
        open={recorder.showStopModal}
        onFinish={handleFinish}
        onDiscard={recorder.discard}
        onContinue={recorder.resume}
      />

      <NoMinutesModal
        open={recorder.showNoMinutesModal}
        title={recorder.noMinutesTitle}
        subtitle={recorder.noMinutesSubtitle}
        countdown={recorder.noMinutesCountdown}
        onClose={recorder.closeNoMinutes}
      />

      <ProcessingModal open={recorder.showProcessingModal} />

      <DiscardedModal
        open={recorder.showDiscardedModal}
        onClose={handleDiscardedClose}
      />

      <QuotaReachedModal
        open={recorder.showQuotaReachedModal}
        countdown={recorder.quotaReachedCountdown}
        hasReset={recorder.hasQuotaReset}
        noResetMessage={recorder.noResetMessage}
        onSave={handleSaveFromQuota}
        onDiscard={handleDiscardFromQuota}
      />

      <SettingsPanel
        open={recorder.settingsOpen}
        photoDelay={recorder.photoDelay}
        onDelayMinus={recorder.decreaseDelay}
        onDelayPlus={recorder.increaseDelay}
        stylize={recorder.stylizePhotos}
        onStylizeToggle={recorder.toggleStylize}
        onClose={recorder.toggleSettings}
        participantName={recorder.participantName}
        onParticipantNameChange={recorder.setParticipantName}
        highlightName={nameFlash}
      />

      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function MobileRecorder({ recorder, className = "", nameFlash, setNameFlash }) {
  const [flash, setFlash] = useState(false);
  const [projectFlash, setProjectFlash] = useState(false);
  const flashTimeoutRef = useRef(null);

  const isRecording = recorder.status === "recording";
  const isPaused = recorder.status === "paused";

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  const triggerFlash = (setter) => {
    setter(true);
    setTimeout(() => setter(false), 175);
    setTimeout(() => setter(true), 350);
    setTimeout(() => setter(false), 525);
  };

  const handleStart = () => {
    if (!recorder.projectName.trim()) {
      triggerFlash(setProjectFlash);
      return;
    }
    if (!recorder.participantName.trim()) {
      recorder.toggleSettings();
      setTimeout(() => triggerFlash(setNameFlash), 100);
      return;
    }
    recorder.start();
  };

  const handleCapture = () => {
    if (!recorder.canCapturePhoto) return;
    setFlash(true);
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = setTimeout(() => setFlash(false), 180);
    recorder.capturePhoto();
  };

  return (
    <div className={`fixed inset-0 h-[100dvh] overflow-hidden bg-black text-white ${className}`}>
      <div className="absolute inset-0">
        <VideoCanvas
          fullScreen
          className="h-full w-full"
          stream={recorder.stream}
          facingMode={recorder.facingMode}
          orientation={recorder.orientation}
        />
        <div
          className={`pointer-events-none absolute inset-0 bg-white/80 transition-opacity duration-300 ${
            flash ? "opacity-80" : "opacity-0"
          }`}
        />
        <div className="absolute bottom-24 left-4">
          <div className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white">
            {recorder.participantName || "Nombre"}
          </div>
        </div>
      </div>

      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 py-3">
        <Link
          href="/projects"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <FolderIcon className="h-5 w-5" />
        </Link>

        <input
          value={recorder.projectName}
          onChange={(event) => recorder.setProjectName(event.target.value)}
          placeholder="Sin título"
          disabled={recorder.status !== "stopped"}
          maxLength={50}
          className={`mx-2 min-w-0 flex-1 rounded-full px-2 py-2 text-sm font-semibold text-white placeholder:text-white/60 focus:outline-none transition-colors ${
            projectFlash ? "bg-white/40" : "bg-transparent"
          } ${recorder.status !== "stopped" ? "opacity-70" : ""}`}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={recorder.switchCamera}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            title="Cambiar cámara"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={recorder.toggleSettings}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            title="Configuración"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 bottom-24 -translate-x-1/2">
        <div className="text-sm font-semibold text-text-muted">
          {recorder.timerLabel}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-4 pb-6 pt-4">
        <div className="grid grid-cols-3 items-center gap-3">
          <div className="flex justify-start">
            {isRecording ? (
              <button
                type="button"
                onClick={recorder.pause}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white"
              >
                <PauseIcon className="h-5 w-5" />
                Pausa
              </button>
            ) : isPaused ? (
              <button
                type="button"
                onClick={recorder.resume}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white"
              >
                <PlayIcon className="h-5 w-5" />
                Continuar
              </button>
            ) : (
              <div className="h-12" />
            )}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={isRecording || isPaused ? recorder.requestStop : handleStart}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 transition"
            >
              {isRecording || isPaused ? (
                <StopIcon className="h-7 w-7" />
              ) : (
                <PlayIcon className="h-7 w-7" />
              )}
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCapture}
              disabled={!recorder.canCapturePhoto}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-50"
              title="Tomar foto"
            >
              <CameraIcon className="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
