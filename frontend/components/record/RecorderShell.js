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
import ToastList from "@/components/common/ToastList";
import Preview from "./Preview";
import RecorderControls from "./RecorderControls";
import SettingsPanel from "./SettingsPanel";
import StopModal from "./StopModal";
import NoMinutesModal from "./NoMinutesModal";
import ProcessingModal from "./ProcessingModal";
import DiscardedModal from "./DiscardedModal";
import QuotaReachedModal from "./QuotaReachedModal";
import PausingModal from "./PausingModal";
import { useRecorder } from "@/hooks/recording/useRecorder";
import VideoCanvas from "./VideoCanvas";

export default function RecorderShell() {
  const router = useRouter();
  const recorder = useRecorder();
  const [toasts, setToasts] = useState([]);
  const [nameFlash, setNameFlash] = useState(false);
  const { setToastHandler } = recorder;
  const desktopCaptureHandlerRef = useRef(null);

  const handleDesktopStop = useCallback(async () => {
    if (recorder.status === "recording") {
      await recorder.pause();
    }
    recorder.requestStop();
  }, [recorder.pause, recorder.requestStop, recorder.status]);

  // Handler para finalizar y navegar a proyectos
  const handleFinish = useCallback(async () => {
    const result = await recorder.stop();
    if (result?.ok) {
      // Navegar a la página de proyectos después de procesar
      router.push("/projects");
    }
  }, [recorder, router]);

  // Handler para cerrar modal de descartado (quedarse en la página para nueva grabación)
  const handleDiscardedClose = useCallback(() => {
    recorder.closeDiscardedModal();
  }, [recorder]);

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
      if (desktopCaptureHandlerRef.current) {
        event.preventDefault();
        desktopCaptureHandlerRef.current();
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
      <div className="hidden h-full overflow-hidden lg:flex lg:flex-col">
        <main className="mx-auto flex min-h-0 flex-1 w-full max-w-5xl flex-col gap-4 overflow-hidden px-4 pb-6 pt-4">
          <section className="flex min-h-0 flex-1 flex-col gap-4">
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
              participantName={recorder.participantName}
              onParticipantNameChange={recorder.setParticipantName}
              status={recorder.status}
              onOpenSettings={recorder.toggleSettings}
              statusLabel={recorder.statusLabel}
              registerCaptureHandler={(handler) => {
                desktopCaptureHandlerRef.current = handler;
              }}
            />

            <div className="shrink-0 rounded-2xl border border-bg-surface-light bg-bg-surface/60 p-4">
              <RecorderControls
                status={recorder.status}
                onStart={recorder.start}
                onStop={handleDesktopStop}
                onPause={recorder.pause}
                onResume={recorder.resume}
                projectName={recorder.projectName}
                onProjectNameChange={recorder.setProjectName}
                timerLabel={recorder.timerLabel}
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

      <PausingModal open={recorder.isPausing} />

      <PausingModal 
        open={recorder.isResuming} 
        title="Reanudando..." 
        subtitle="Espere un momento" 
      />

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
  const isStopped = recorder.status === "stopped";
  const isLandscape = recorder.orientation.startsWith("landscape");

  // Fullscreen helpers
  const enterFullscreen = useCallback(() => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }, []);

  // Salir de fullscreen cuando se detiene la grabación
  useEffect(() => {
    if (isStopped) {
      exitFullscreen();
    }
  }, [isStopped, exitFullscreen]);

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
    // Entrar en fullscreen al iniciar
    enterFullscreen();
    recorder.start();
  };

  const handleCapture = () => {
    if (!recorder.canCapturePhoto) return;
    
    // Flash doble rapido: on-off-on-off en 300ms
    setFlash(true);
    setTimeout(() => setFlash(false), 75);
    setTimeout(() => setFlash(true), 150);
    setTimeout(() => setFlash(false), 225);
    
    recorder.capturePhoto();
  };

  // Componentes de botones reutilizables
  const PauseResumeButton = () => {
    if (isRecording) {
      return (
        <button
          type="button"
          onClick={recorder.pause}
          className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white"
        >
          <PauseIcon className="h-7 w-7" />
        </button>
      );
    }
    if (isPaused) {
      return (
        <button
          type="button"
          onClick={recorder.resume}
          className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white"
        >
          <PlayIcon className="h-7 w-7" />
        </button>
      );
    }
    return <div className="h-16 w-16" />;
  };

  const StartStopButton = () => (
    <button
      type="button"
      onClick={isRecording || isPaused ? recorder.requestStop : handleStart}
      disabled={recorder.isStarting}
      className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 transition disabled:opacity-70"
    >
      {recorder.isStarting ? (
        <svg className="h-9 w-9 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : isRecording || isPaused ? (
        <StopIcon className="h-9 w-9" />
      ) : (
        <PlayIcon className="h-9 w-9" />
      )}
    </button>
  );

  const CaptureButton = () => (
    <button
      type="button"
      onClick={handleCapture}
      disabled={!recorder.canCapturePhoto}
      className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-50"
      title="Tomar foto"
    >
      <CameraIcon className="h-7 w-7" />
    </button>
  );

  const CameraSettingsButtons = () => (
    <>
      <button
        type="button"
        onClick={recorder.switchCamera}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
        title="Cambiar cámara"
      >
        <ArrowPathIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={recorder.toggleSettings}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
        title="Configuración"
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </button>
    </>
  );

  return (
    <div className={`fixed inset-0 h-[100dvh] overflow-hidden bg-black text-white ${className}`}>
      {/* Video y flash */}
      <div className="absolute inset-0">
        <VideoCanvas
          fullScreen
          className="h-full w-full"
          stream={recorder.stream}
          facingMode={recorder.facingMode}
          orientation={recorder.orientation}
        />
        <div
          className={`pointer-events-none absolute inset-0 bg-white ${
            flash ? "opacity-90" : "opacity-0"
          }`}
        />
      </div>

      {/* Tag participante */}
      <div className={`absolute left-4 ${isLandscape ? "bottom-4" : "bottom-32"}`}>
        <div className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white">
          {recorder.participantName || "Nombre"}
        </div>
      </div>

      {/* Timer */}
      <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${
        isLandscape ? "bottom-4" : "bottom-32"
      }`}>
        <div className="text-sm font-semibold text-text-muted">
          {recorder.timerLabel}
        </div>
      </div>

      {isLandscape ? (
        <>
          {/* LANDSCAPE: Top bar - Projects/Titulo izquierda */}
          <div className="absolute left-0 top-0 flex items-center gap-2 px-4 py-3">
            <Link
              href="/projects"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
            >
              <FolderIcon className="h-5 w-5" />
            </Link>
            <input
              value={recorder.projectName}
              onChange={(event) => recorder.setProjectName(event.target.value)}
              placeholder="Sin título"
              disabled={recorder.status !== "stopped"}
              maxLength={50}
              className={`w-32 rounded-full px-2 py-2 text-sm font-semibold text-white placeholder:text-white/60 focus:outline-none transition-colors ${
                projectFlash ? "bg-white/40" : "bg-transparent"
              } ${recorder.status !== "stopped" ? "opacity-70" : ""}`}
            />
          </div>

          {/* LANDSCAPE: Top bar - Cam/Set derecha con margen (no sobre botones) */}
          <div className="absolute right-28 top-0 flex items-center gap-2 py-3">
            <CameraSettingsButtons />
          </div>

          {/* LANDSCAPE: Botones principales - columna vertical a la derecha */}
          <div className="absolute right-0 inset-y-0 flex flex-col items-center justify-center gap-4 px-4">
            <PauseResumeButton />
            <StartStopButton />
            <CaptureButton />
          </div>
        </>
      ) : (
        <>
          {/* PORTRAIT: Top bar completo */}
          <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 py-3">
            <Link
              href="/projects"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
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
              <CameraSettingsButtons />
            </div>
          </div>

          {/* PORTRAIT: Botones principales - fila horizontal abajo */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-8 pt-4">
            <div className="grid grid-cols-3 items-center gap-4">
              <div className="flex justify-start">
                <PauseResumeButton />
              </div>
              <div className="flex justify-center">
                <StartStopButton />
              </div>
              <div className="flex justify-end">
                <CaptureButton />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
