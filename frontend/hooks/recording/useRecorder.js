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
  const configLoadedRef = useRef(false);
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
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const isPausingRef = useRef(false);
  const [orientation, setOrientation] = useState("portrait");
  const [chunkDuration, setChunkDuration] = useState(5);
  const chunkDurationRef = useRef(5);
  const [audioWsPath, setAudioWsPath] = useState("/ws/audio");

  const applyChunkDuration = useCallback((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) return;
    chunkDurationRef.current = parsed;
    setChunkDuration(parsed);
  }, []);

  useEffect(() => {
    chunkDurationRef.current = chunkDuration;
  }, [chunkDuration]);

  const getChunkDuration = useCallback(() => {
    return Math.max(1, Number(chunkDurationRef.current) || 5);
  }, []);

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

  const getElapsedMs = useCallback(() => {
    return timers.elapsedSeconds * 1000;
  }, [timers.elapsedSeconds]);

  const ensurePreviewStream = useCallback(async () => {
    let currentStream = media.getStream?.();
    if (!currentStream || !currentStream.active) {
      currentStream = await media.startPreview();
    }
    if (videoRef.current && videoRef.current.srcObject !== currentStream) {
      videoRef.current.srcObject = currentStream;
    }
    return currentStream;
  }, [media]);

  const getAudioStream = useCallback(() => {
    const currentStream = media.getStream?.();
    if (!currentStream) return null;
    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) return null;
    return new MediaStream(audioTracks);
  }, [media]);

  const engine = useRecorderEngine({
    getAudioStream,
    getChunkDuration,
    audioWsPath,
    onQuotaExceeded: handleQuotaExceeded
  });

  const photos = usePhotos({
    projectId,
    videoRef,
    stylize: stylizePhotos,
    onQuotaExceeded: handleQuotaExceeded,
    getElapsedMs
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
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const durationValue =
        data.chunk_duration_seconds ??
        data.chunk_duration ??
        (data.chunk_duration_ms ? data.chunk_duration_ms / 1000 : undefined);
      applyChunkDuration(durationValue);
      if (data.audio_ws_path) {
        setAudioWsPath(data.audio_ws_path);
      }
    } catch (err) {
      // ignore
    } finally {
      configLoadedRef.current = true;
    }
  }, [applyChunkDuration, setAudioWsPath]);

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
    setIsStarting(true);
    dispatch({ type: "START_REQUEST" });
    try {
      if (!configLoadedRef.current) {
        await fetchConfig();
      }
      // Usar el stream existente del preview (ya incluye audio)
      // Si no hay stream, intentar iniciarlo
      await ensurePreviewStream();
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
      photos.setPhotos([]);
      photos.setQuotaExceeded(false);
      timers.start();
      await engine.startStream(newProjectId, { reset: true });
      dispatch({ type: "START_SUCCESS" });
    } catch (err) {
      media.stop();
      try {
        await engine.stopStream({ flush: false, finalize: false });
      } catch {
        // ignore
      }
      dispatch({ type: "START_FAILURE", error: err.message });
      const message = err?.name
        ? mediaErrorMessage(err, { needsAudio: true })
        : err?.message || "Error al iniciar. Verifica permisos de cámara/micrófono.";
      notify(message, "error");
    } finally {
      setIsStarting(false);
    }
  }, [participantName, projectName, dispatch, media, quotas, timers, engine, photos, notify, fetchConfig]);

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
    // Cambiar estado inmediatamente para UI responsiva
    dispatch({ type: "PAUSE" });
    timers.pause();
    // Enviar chunk en segundo plano
    setIsPausing(true);
    isPausingRef.current = true;
    try {
      await engine.stopStream({ flush: true, finalize: false, expectResume: true });
    } finally {
      setIsPausing(false);
      isPausingRef.current = false;
    }
  }, [state.status, timers, engine, dispatch]);

  const resume = useCallback(async () => {
    if (state.status !== "paused") return;
    // Si la cuota está excedida, no permitir reanudar
    if (engine.isQuotaExceeded()) {
      quotas.openQuotaReached();
      return;
    }
    
    // Si aún está pausando (enviando chunk), esperar
    if (isPausingRef.current) {
      setIsResuming(true);
      // Esperar a que termine de enviar el chunk
      await new Promise((resolve) => {
        const checkPausing = () => {
          if (!isPausingRef.current) {
            resolve();
          } else {
            setTimeout(checkPausing, 100);
          }
        };
        checkPausing();
      });
      setIsResuming(false);
    }
    
    await ensurePreviewStream();
    setShowStopModal(false);
    quotas.closeQuotaReached();
    timers.resume();
    await engine.startStream(projectIdRef.current, { reset: false });
    dispatch({ type: "RESUME" });
  }, [state.status, timers, engine, quotas, dispatch, ensurePreviewStream]);

  const requestStop = useCallback(async () => {
    if (state.status === "recording") {
      await pause();
    }
    if (state.status === "recording" || state.status === "paused") {
      setShowStopModal(true);
    }
  }, [state.status, pause]);

  const stop = useCallback(async () => {
    const currentProjectId = projectIdRef.current;
    if (!currentProjectId) return;

    dispatch({ type: "STOP_REQUEST" });
    setShowStopModal(false);
    quotas.closeQuotaReached();
    // Mostrar modal de procesamiento
    setShowProcessingModal(true);
    timers.pause();
    await engine.stopStream({ flush: true, finalize: true });

    try {
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
      engine.reset();
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
      await engine.stopStream({ flush: false, finalize: true });

      await fetch(`/api/project/${currentProjectId}`, {
        method: "DELETE",
        credentials: "include"
      });

      media.stop();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      timers.stop();
      engine.reset();
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

  const canCapturePhoto = showPreview && !photos.isCapturing && state.status === "recording";

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
    // Estado de pausa (enviando chunk)
    isPausing,
    // Estado de reanudando (esperando que termine pausa)
    isResuming,
    // Estado de iniciando (esperando servidor)
    isStarting,
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
