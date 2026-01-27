"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRecorderReducer } from "./useRecorderReducer";
import { useMediaStreams } from "./useMediaStreams";
import { useRecorderEngine } from "./useRecorderEngine";
import { useTimers } from "./useTimers";
import { usePhotos } from "./usePhotos";
import { useQuotas } from "./useQuotas";

export function useRecorder() {
  const [state, dispatch] = useRecorderReducer();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [projectId, setProjectId] = useState(null);
  const projectIdRef = useRef(null);
  const [projectName, setProjectName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stylizePhotos, setStylizePhotos] = useState(true);
  const [statusLabel, setStatusLabel] = useState("Detenido");
  const toastHandlerRef = useRef(null);
  const previewInitRef = useRef(false);
  const previewErrorShownRef = useRef(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [showDiscardedModal, setShowDiscardedModal] = useState(false);
  const [orientation, setOrientation] = useState("portrait");
  const [chunkIndex, setChunkIndex] = useState(0);
  const chunkIndexRef = useRef(0);
  const [chunkDuration, setChunkDuration] = useState(5);

  const media = useMediaStreams();
  const quotas = useQuotas();

  // Handler para cuando se alcanza la cuota (desde timer o desde servidor)
  const handleQuotaExceeded = useCallback(() => {
    // Pausar grabación
    dispatch({ type: "PAUSE" });
    // Abrir modal de cuota alcanzada
    quotas.openQuotaReached();
  }, [dispatch, quotas]);

  const timers = useTimers({
    limitSeconds: quotas.recordingLimitSeconds,
    onLimitReached: handleQuotaExceeded
  });

  const photos = usePhotos({
    projectId,
    videoRef,
    stylize: stylizePhotos,
    onQuotaExceeded: handleQuotaExceeded
  });

  const getAudioStream = useCallback(() => {
    const currentStream = media.getStream?.();
    if (!currentStream) return null;
    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) return null;
    return new MediaStream(audioTracks);
  }, [media]);

  const engine = useRecorderEngine({
    getAudioStream,
    chunkDuration,
    onChunkText: null,
    onChunkIndex: (nextIndex) => {
      chunkIndexRef.current = nextIndex;
      setChunkIndex(nextIndex);
    },
    onQuotaExceeded: handleQuotaExceeded
  });

  // Mantener projectIdRef actualizada
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const showPreview = Boolean(media.stream);
  const canvasReady = false;

  const updateOrientation = useCallback(() => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    if (!isLandscape) {
      setOrientation("portrait");
      return;
    }
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    const normalized = ((angle % 360) + 360) % 360;
    if (normalized === 90) setOrientation("landscape-left");
    else if (normalized === 270) setOrientation("landscape-right");
    else setOrientation("landscape-left");
  }, []);

  useEffect(() => {
    updateOrientation();
    window.addEventListener("orientationchange", updateOrientation);
    window.addEventListener("resize", updateOrientation);
    return () => {
      window.removeEventListener("orientationchange", updateOrientation);
      window.removeEventListener("resize", updateOrientation);
    };
  }, [updateOrientation]);

  useEffect(() => {
    const savedName = localStorage.getItem("hilo:name");
    if (savedName) {
      setParticipantName(savedName);
    }
    const savedDelay = localStorage.getItem("hilo:photoDelay");
    if (savedDelay) {
      photos.setPhotoDelay(Number(savedDelay));
    }
    const savedStylize = localStorage.getItem("hilo:stylize");
    if (savedStylize !== null) {
      setStylizePhotos(savedStylize === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("hilo:name", participantName);
  }, [participantName]);

  useEffect(() => {
    localStorage.setItem("hilo:photoDelay", String(photos.photoDelay));
  }, [photos.photoDelay]);

  useEffect(() => {
    localStorage.setItem("hilo:stylize", String(stylizePhotos));
  }, [stylizePhotos]);

  useEffect(() => {
    if (state.status === "recording") {
      setStatusLabel("Grabando");
    } else if (state.status === "paused") {
      setStatusLabel("Pausa");
    } else {
      setStatusLabel("Detenido");
    }
  }, [state.status]);

  const timerLabel = timers.formatTimer();

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { credentials: "include" });
      const data = await res.json();
      if (data.chunk_duration) {
        setChunkDuration(data.chunk_duration);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onMeta = () => {
      video.play?.().catch(() => {});
    };

    video.srcObject = media.stream || null;
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("canplay", onMeta);
    if (video.readyState >= 2) {
      onMeta();
    }

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("canplay", onMeta);
    };
  }, [media.stream]);

  const notify = useCallback((message, type = "error") => {
    if (toastHandlerRef.current) {
      toastHandlerRef.current(message, type);
    }
  }, []);

  const mediaErrorMessage = useCallback((err, { needsAudio = false } = {}) => {
    const deviceLabel = needsAudio ? "cámara o micrófono" : "cámara";
    switch (err?.name) {
      case "NotAllowedError":
      case "SecurityError":
        return `Permiso de ${deviceLabel} denegado. Revisa permisos en el navegador.`;
      case "NotFoundError":
        return `No se encontró ${deviceLabel} disponible.`;
      case "NotReadableError":
        return `La ${deviceLabel} está en uso por otra aplicación.`;
      case "OverconstrainedError":
        return "La cámara no cumple los requisitos solicitados.";
      default:
        return `Error al iniciar la ${deviceLabel}. Revisa permisos en el navegador.`;
    }
  }, []);

  const setToastHandler = useCallback((handler) => {
    toastHandlerRef.current = handler;
  }, []);

  const start = useCallback(async () => {
    if (!participantName.trim()) {
      notify("Ingresa un nombre primero", "error");
      return;
    }
    if (!projectName.trim()) {
      notify("Ingresa un nombre para el proyecto", "error");
      return;
    }
    dispatch({ type: "START_REQUEST" });
    try {
      const stream = await media.startRecording();
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      const res = await fetch("/api/project/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project_name: projectName.trim(),
          participant_name: participantName
        })
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.recording_remaining_seconds === 0) {
          quotas.openNoMinutes(data.recording_reset_at ? new Date(data.recording_reset_at) : null);
        }
        throw new Error(data.error || "Error creando proyecto");
      }
      const newProjectId = data.project_id;
      setProjectId(newProjectId);
      projectIdRef.current = newProjectId;
      quotas.updateFromStart(data);
      setChunkIndex(0);
      chunkIndexRef.current = 0;
      photos.setPhotos([]);
      photos.setQuotaExceeded(false);
      timers.start();
      // Pasar projectId como argumento para evitar problema de closure
      engine.startChunkCycle(0, newProjectId);
      dispatch({ type: "START_SUCCESS" });
    } catch (err) {
      media.stop();
      dispatch({ type: "START_FAILURE", error: err.message });
      const message = err?.name
        ? mediaErrorMessage(err, { needsAudio: true })
        : err?.message || "Error al iniciar. Verifica permisos de cámara/micrófono.";
      notify(message, "error");
    }
  }, [participantName, projectName, dispatch, media, quotas, timers, engine, photos, notify]);

  useEffect(() => {
    if (previewInitRef.current) return;
    previewInitRef.current = true;
    let active = true;
    const initPreview = async () => {
      try {
        await media.startPreview();
      } catch (err) {
        if (active && !previewErrorShownRef.current) {
          previewErrorShownRef.current = true;
          notify(mediaErrorMessage(err, { needsAudio: false }), "error");
        }
      }
    };
    initPreview();
    return () => {
      active = false;
      media.stop();
      previewInitRef.current = false;
    };
  }, []);

  const pause = useCallback(async () => {
    if (state.status !== "recording") return;
    timers.pause();
    // Enviar chunk actual al pausar, independiente del tamaño
    await engine.stopChunkCycle(true);
    dispatch({ type: "PAUSE" });
  }, [state.status, timers, engine, dispatch]);

  const resume = useCallback(() => {
    if (state.status !== "paused") return;
    // Si la cuota está excedida, no permitir reanudar
    if (engine.isQuotaExceeded()) {
      quotas.openQuotaReached();
      return;
    }
    setShowStopModal(false);
    quotas.closeQuotaReached();
    timers.resume();
    engine.startChunkCycle(chunkIndexRef.current || 0, projectIdRef.current);
    dispatch({ type: "RESUME" });
  }, [state.status, timers, engine, quotas, dispatch]);

  const requestStop = useCallback(() => {
    if (state.status === "recording" || state.status === "paused") {
      setShowStopModal(true);
    }
  }, [state.status]);

  const stop = useCallback(async () => {
    const currentProjectId = projectIdRef.current;
    if (!currentProjectId) return;

    dispatch({ type: "STOP_REQUEST" });
    setShowStopModal(false);
    quotas.closeQuotaReached();
    // Mostrar modal de procesamiento
    setShowProcessingModal(true);

    try {
      // Detener y enviar último chunk
      await engine.stopChunkCycle(true);

      const res = await fetch("/api/project/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project_id: currentProjectId,
          participant_name: participantName,
          project_name: projectName,
          stylize_photos: stylizePhotos
        })
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error al detener");
      }
      media.stop();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      timers.stop();
      setProjectId(null);
      projectIdRef.current = null;
      setShowProcessingModal(false);
      dispatch({ type: "STOP_SUCCESS" });

      // Retornar datos para navegación
      return {
        ok: true,
        projectId: currentProjectId,
        resultUrl: data.result_url || `/r/${currentProjectId}`
      };
    } catch (err) {
      setShowProcessingModal(false);
      dispatch({ type: "STOP_FAILURE", error: err.message });
      notify(err.message || "Error al detener", "error");
      return { ok: false, error: err.message };
    }
  }, [engine, participantName, projectName, stylizePhotos, media, timers, quotas, dispatch, notify]);

  const discard = useCallback(async () => {
    const currentProjectId = projectIdRef.current;
    if (!currentProjectId) return;

    setShowStopModal(false);
    quotas.closeQuotaReached();

    try {
      // Detener sin enviar último chunk
      await engine.stopChunkCycle(false);

      await fetch(`/api/project/${currentProjectId}`, {
        method: "DELETE",
        credentials: "include"
      });

      media.stop();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      timers.stop();
      setProjectId(null);
      projectIdRef.current = null;
      dispatch({ type: "STOP_SUCCESS" });

      // Mostrar modal de descartado exitosamente
      setShowDiscardedModal(true);
    } catch (err) {
      notify("Error al descartar la grabación", "error");
    }
  }, [engine, media, timers, quotas, dispatch, notify]);

  const closeDiscardedModal = useCallback(() => {
    setShowDiscardedModal(false);
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((prev) => !prev);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!showPreview) return;
    photos.capturePhoto();
  }, [photos, showPreview]);

  const canCapturePhoto = showPreview && !photos.isCapturing;

  const switchCamera = useCallback(async () => {
    try {
      await media.switchCamera();
    } catch (err) {
      notify("No se pudo cambiar de cámara", "error");
    }
  }, [media, notify]);

  return {
    status: state.status,
    statusLabel,
    timerLabel,
    projectName,
    setProjectName,
    participantName,
    setParticipantName,
    settingsOpen,
    toggleSettings,
    start,
    pause,
    resume,
    requestStop,
    stop,
    discard,
    showStopModal,
    // Modal de procesamiento
    showProcessingModal,
    // Modal de descartado
    showDiscardedModal,
    closeDiscardedModal,
    // Modal sin minutos (al inicio)
    showNoMinutesModal: quotas.noMinutesOpen,
    noMinutesTitle: quotas.noMinutesTitle,
    noMinutesSubtitle: quotas.noMinutesSubtitle,
    noMinutesCountdown: quotas.noMinutesCountdown,
    closeNoMinutes: quotas.closeNoMinutes,
    // Modal cuota alcanzada (durante grabación)
    showQuotaReachedModal: quotas.quotaReachedOpen,
    quotaReachedCountdown: quotas.quotaReachedCountdown,
    hasQuotaReset: quotas.resetAt !== null,
    noResetMessage: quotas.getNoResetMessage(),
    closeQuotaReached: quotas.closeQuotaReached,
    // Handler para guardar desde modal de cuota
    saveFromQuotaReached: stop,
    // Handler para descartar desde modal de cuota
    discardFromQuotaReached: discard,
    // Fotos
    photos: photos.photos,
    photoDelay: photos.photoDelay,
    decreaseDelay: () => photos.setPhotoDelay(Math.max(0, photos.photoDelay - 1)),
    increaseDelay: () => photos.setPhotoDelay(photos.photoDelay + 1),
    stylizePhotos,
    toggleStylize: () => setStylizePhotos((prev) => !prev),
    // Video/Preview
    videoRef,
    canvasRef,
    showPreview,
    isMirrored: media.facingMode === "user",
    canvasReady,
    capturePhoto,
    canCapturePhoto,
    switchCamera,
    setToastHandler,
    stream: media.stream,
    facingMode: media.facingMode,
    orientation,
    // Timer info
    hasTimeLimit: timers.hasLimit,
    remainingSeconds: timers.getRemainingSeconds()
  };
}
