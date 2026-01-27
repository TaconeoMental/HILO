"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecorderReducer } from "./useRecorderReducer";
import { useMediaStreams } from "./useMediaStreams";
import { useRecorderEngine } from "./useRecorderEngine";
import { useTimers } from "./useTimers";
import { usePhotos } from "./usePhotos";
import { useQuotas } from "./useQuotas";
import { useCanvasPreview } from "./useCanvasPreview";

export function useRecorder() {
  const [state, dispatch] = useRecorderReducer();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stylizePhotos, setStylizePhotos] = useState(true);
  const [statusLabel, setStatusLabel] = useState("Detenido");
  const toastHandlerRef = useRef(null);
  const [showStopModal, setShowStopModal] = useState(false);
  const [orientation, setOrientation] = useState("portrait");
  const [chunkIndex, setChunkIndex] = useState(0);
  const chunkIndexRef = useRef(0);
  const [chunkDuration, setChunkDuration] = useState(5);

  const media = useMediaStreams();
  const timers = useTimers();
  const quotas = useQuotas();

  const photos = usePhotos({
    projectId,
    videoRef,
    stylize: stylizePhotos
  });

  const engine = useRecorderEngine({
    audioStream: media.stream ? new MediaStream(media.stream.getAudioTracks()) : null,
    chunkDuration,
    projectId,
    onChunkText: null,
    onChunkIndex: (nextIndex) => {
      chunkIndexRef.current = nextIndex;
      setChunkIndex(nextIndex);
    }
  });

  const showPreview = state.status === "recording" || state.status === "paused";

  const canvas = useCanvasPreview({
    videoRef,
    canvasRef,
    active: showPreview,
    facingMode: media.facingMode,
    orientation
  });

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

  const notify = useCallback((message, type = "error") => {
    if (toastHandlerRef.current) {
      toastHandlerRef.current(message, type);
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
      const stream = await media.start();
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
      setProjectId(data.project_id);
      quotas.updateFromStart(data);
      setChunkIndex(0);
      chunkIndexRef.current = 0;
      photos.setPhotos([]);
      timers.start();
      engine.startChunkCycle(0);
      dispatch({ type: "START_SUCCESS" });
    } catch (err) {
      media.stop();
      dispatch({ type: "START_FAILURE", error: err.message });
      notify(err.message || "Error al iniciar. Verifica permisos de cámara/micrófono.", "error");
    }
  }, [participantName, projectName, dispatch, media, quotas, timers, engine, photos, notify]);

  const pause = useCallback(() => {
    if (state.status !== "recording") return;
    timers.pause();
    engine.stopChunkCycle();
    dispatch({ type: "PAUSE" });
  }, [state.status, timers, engine, dispatch]);

  const resume = useCallback(() => {
    if (state.status !== "paused") return;
    setShowStopModal(false);
    timers.resume();
    engine.startChunkCycle(chunkIndexRef.current || 0);
    dispatch({ type: "RESUME" });
  }, [state.status, timers, engine, dispatch]);

  const requestStop = useCallback(() => {
    if (state.status === "recording" || state.status === "paused") {
      setShowStopModal(true);
    }
  }, [state.status]);

  const stop = useCallback(async () => {
    if (!projectId) return;
    dispatch({ type: "STOP_REQUEST" });
    setShowStopModal(false);
    try {
      await engine.stopChunkCycle();
      const res = await fetch("/api/project/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project_id: projectId,
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
      dispatch({ type: "STOP_SUCCESS" });
    } catch (err) {
      dispatch({ type: "STOP_FAILURE", error: err.message });
      notify(err.message || "Error al detener", "error");
    }
  }, [projectId, engine, participantName, projectName, media, timers, dispatch, notify]);

  const discard = useCallback(async () => {
    if (!projectId) return;
    setShowStopModal(false);
    await fetch(`/api/project/${projectId}`, {
      method: "DELETE",
      credentials: "include"
    });
    media.stop();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    timers.stop();
    setProjectId(null);
    dispatch({ type: "STOP_SUCCESS" });
  }, [projectId, media, timers, dispatch]);

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
    showNoMinutesModal: quotas.noMinutesOpen,
    noMinutesTitle: quotas.noMinutesTitle,
    noMinutesSubtitle: quotas.noMinutesSubtitle,
    noMinutesCountdown: quotas.noMinutesCountdown,
    closeNoMinutes: quotas.closeNoMinutes,
    photos: photos.photos,
    photoDelay: photos.photoDelay,
    decreaseDelay: () => photos.setPhotoDelay(Math.max(0, photos.photoDelay - 1)),
    increaseDelay: () => photos.setPhotoDelay(photos.photoDelay + 1),
    stylizePhotos,
    toggleStylize: () => setStylizePhotos((prev) => !prev),
    videoRef,
    canvasRef,
    showPreview,
    isMirrored: media.facingMode === "user",
    canvasReady: canvas.ready,
    capturePhoto,
    canCapturePhoto,
    switchCamera,
    setToastHandler
  };
}
