import { useCallback, useMemo, useRef, useState } from "react";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus"
];

export function useRecorderEngine({
  getAudioStream,
  getChunkDuration,
  audioWsPath,
  onQuotaExceeded
}) {
  const recorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const releaseStreamOnStopRef = useRef(true);
  const wsRef = useRef(null);
  const wsReadyRef = useRef(null);
  const projectIdRef = useRef(null);
  const seqRef = useRef(0);
  const chunkCursorRef = useRef(0);
  const recordingStartRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pausedStartedAtRef = useRef(null);
  const pendingChunksRef = useRef(0);
  const [pendingChunks, setPendingChunks] = useState(0);
  const quotaExceededRef = useRef(false);

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const explicit = process.env.NEXT_PUBLIC_AUDIO_WS_URL;
    if (explicit) {
      const base = explicit.endsWith("/") ? explicit.slice(0, -1) : explicit;
      return `${base}${audioWsPath}`;
    }
    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${host}${audioWsPath}`;
  }, [audioWsPath]);

  const findMimeType = useCallback(() => {
    for (const type of MIME_TYPES) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }, []);

  const updatePendingChunks = useCallback((delta) => {
    pendingChunksRef.current = Math.max(0, pendingChunksRef.current + delta);
    setPendingChunks(pendingChunksRef.current);
  }, []);

  const waitForPendingChunks = useCallback((timeoutMs = 15000) => {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const tick = () => {
        if (pendingChunksRef.current <= 0) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }, []);

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch (err) {
        console.warn("WS close error", err);
      }
      wsRef.current = null;
      wsReadyRef.current = null;
    }
  }, []);

  const resetTracking = useCallback(() => {
    seqRef.current = 0;
    chunkCursorRef.current = 0;
    recordingStartRef.current = 0;
    pausedAccumRef.current = 0;
    pausedStartedAtRef.current = null;
    pendingChunksRef.current = 0;
    setPendingChunks(0);
    quotaExceededRef.current = false;
  }, []);

  const handleServerMessage = useCallback((payload) => {
    if (payload?.type === "error") {
      const errorText = payload.error || "Error en ingestión";
      if (errorText.includes("Tiempo de grabación agotado")) {
        quotaExceededRef.current = true;
        onQuotaExceeded?.();
      }
      console.warn("Audio WS error", errorText);
    }
  }, [onQuotaExceeded]);

  const ensureWebSocket = useCallback((projectId) => {
    if (!wsUrl) {
      throw new Error("WebSocket no disponible");
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsReadyRef.current || Promise.resolve();
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    const readyPromise = new Promise((resolve, reject) => {
      ws.onopen = () => {
        const chunkMs = Math.max(1, Number(getChunkDuration?.() || 5)) * 1000;
        ws.send(JSON.stringify({
          type: "init",
          project_id: projectId,
          chunk_ms: chunkMs
        }));
        resolve();
      };
      ws.onerror = (event) => {
        reject(event);
      };
    });
    wsReadyRef.current = readyPromise;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        // ignore invalid json
      }
    };

    ws.onclose = () => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch (err) {
          console.warn("Recorder stop error", err);
        }
      }
    };

    return readyPromise;
  }, [getChunkDuration, handleServerMessage, wsUrl]);

  const sendChunk = useCallback(async (blob) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    if (quotaExceededRef.current) {
      return;
    }

    updatePendingChunks(1);
    try {
      await wsReadyRef.current;
      const buffer = await blob.arrayBuffer();
      const seq = seqRef.current++;

      const now = performance.now();
      if (!recordingStartRef.current) {
        recordingStartRef.current = now;
      }
      if (pausedStartedAtRef.current) {
        pausedAccumRef.current += now - pausedStartedAtRef.current;
        pausedStartedAtRef.current = null;
      }
      const elapsedAudio = Math.max(0, Math.round(now - recordingStartRef.current - pausedAccumRef.current));
      const startMs = chunkCursorRef.current;
      let durationMs = Math.max(1, elapsedAudio - chunkCursorRef.current);
      chunkCursorRef.current = elapsedAudio;

      const meta = {
        type: "chunk",
        seq,
        start_ms: startMs,
        duration_ms: durationMs,
        size: buffer.byteLength
      };
      wsRef.current.send(JSON.stringify(meta));
      wsRef.current.send(buffer);
    } catch (err) {
      console.warn("sendChunk error", err);
    } finally {
      updatePendingChunks(-1);
    }
  }, [updatePendingChunks]);

  const attachRecorder = useCallback(async (projectId, { resetTimeline }) => {
    const audioStream = getAudioStream?.();
    if (!audioStream || !audioStream.active) {
      throw new Error("Audio stream no disponible");
    }

    audioStreamRef.current = audioStream;
    const mimeType = findMimeType();
    if (!mimeType) {
      throw new Error("MediaRecorder no soportado");
    }

    if (resetTimeline) {
      chunkCursorRef.current = 0;
      recordingStartRef.current = performance.now();
      pausedAccumRef.current = 0;
      pausedStartedAtRef.current = null;
    }

    await ensureWebSocket(projectId);

    const recorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 96000
    });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        void sendChunk(event.data);
      }
    };
    recorder.onstop = () => {
      if (releaseStreamOnStopRef.current) {
        audioStream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      releaseStreamOnStopRef.current = true;
    };

    const timeslice = Math.max(1, Number(getChunkDuration?.() || 5)) * 1000;
    recorder.start(timeslice);
  }, [getChunkDuration, ensureWebSocket, findMimeType, getAudioStream, sendChunk]);

  const startStream = useCallback(async (projectId, { reset = false } = {}) => {
    if (!projectId) {
      throw new Error("projectId requerido");
    }
    const isNewProject = reset || projectIdRef.current !== projectId;
    if (isNewProject) {
      resetTracking();
      projectIdRef.current = projectId;
    }
    if (!recordingStartRef.current) {
      recordingStartRef.current = performance.now();
    }
    if (pausedStartedAtRef.current) {
      pausedAccumRef.current += performance.now() - pausedStartedAtRef.current;
      pausedStartedAtRef.current = null;
    }

    await attachRecorder(projectId, { resetTimeline: isNewProject });
  }, [attachRecorder, resetTracking]);

  const flushRecorder = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }

    await new Promise((resolve) => {
      const originalHandler = recorder.ondataavailable;
      recorder.ondataavailable = (event) => {
        recorder.ondataavailable = originalHandler;
        if (originalHandler) {
          originalHandler(event);
        }
        resolve();
      };
      try {
        recorder.requestData();
      } catch (err) {
        recorder.ondataavailable = originalHandler;
        resolve();
      }
    });
  }, []);

  const stopStream = useCallback(async ({ flush = true, finalize = false, expectResume = false } = {}) => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      releaseStreamOnStopRef.current = !expectResume;
      if (flush) {
        await flushRecorder();
      }
      try {
        recorder.stop();
      } catch (err) {
        console.warn("Recorder stop error", err);
      }
    }
    recorderRef.current = null;
    if (!expectResume) {
      const stream = audioStreamRef.current;
      stream?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    if (expectResume) {
      pausedStartedAtRef.current = performance.now();
    }

    await waitForPendingChunks();

    if (finalize && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "complete" }));
      } catch (err) {
        console.warn("WS complete error", err);
      }
    }

    if (!expectResume) {
      closeWebSocket();
    }

    if (finalize) {
      resetTracking();
      projectIdRef.current = null;
    }
  }, [closeWebSocket, resetTracking, waitForPendingChunks]);

  const reset = useCallback(() => {
    closeWebSocket();
    resetTracking();
    projectIdRef.current = null;
  }, [closeWebSocket, resetTracking]);

  const isQuotaExceeded = useCallback(() => quotaExceededRef.current, []);

  const getProjectId = useCallback(() => projectIdRef.current, []);

  return {
    startStream,
    stopStream,
    reset,
    pendingChunks,
    isQuotaExceeded,
    getProjectId
  };
}
