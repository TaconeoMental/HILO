"use client";

import { useCallback, useEffect, useState } from "react";
import RecorderHeader from "./RecorderHeader";
import ToastList from "@/components/common/ToastList";
import Preview from "./Preview";
import RecorderControls from "./RecorderControls";
import SettingsPanel from "./SettingsPanel";
import StopModal from "./StopModal";
import NoMinutesModal from "./NoMinutesModal";
import { useRecorder } from "@/hooks/recording/useRecorder";

export default function RecorderShell() {
  const recorder = useRecorder();
  const [toasts, setToasts] = useState([]);
  const { setToastHandler } = recorder;

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
    <div className="min-h-screen bg-bg-primary text-text-primary">
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
          <SettingsPanel
            open={recorder.settingsOpen}
            photoDelay={recorder.photoDelay}
            onDelayMinus={recorder.decreaseDelay}
            onDelayPlus={recorder.increaseDelay}
            stylize={recorder.stylizePhotos}
            onStylizeToggle={recorder.toggleStylize}
            onClose={recorder.toggleSettings}
          />
        </section>
      </main>

      <StopModal
        open={recorder.showStopModal}
        onFinish={recorder.stop}
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

      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
