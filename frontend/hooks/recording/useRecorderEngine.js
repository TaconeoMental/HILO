import { useCallback, useRef, useState } from "react";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus"
];

export function useRecorderEngine({
  getAudioStream,
  chunkDuration,
  onChunkText,
  onChunkIndex,
  onQuotaExceeded
}) {
  const [pendingChunks, setPendingChunks] = useState(0);
  const pendingChunksRef = useRef(0);
  const recorderRef = useRef(null);
  const projectIdRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const isRecordingRef = useRef(false);
  const quotaExceededRef = useRef(false);
  const intervalRef = useRef(null);
  const chunkTimeoutRef = useRef(null);

  const findMimeType = useCallback(() => {
    for (const type of MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }, []);

  const sendChunk = useCallback(
    async (blob, index, projectId) => {
      if (quotaExceededRef.current) return false;
      if (!projectId) {
        console.warn("sendChunk: projectId is null");
        return false;
      }

      const formData = new FormData();
      formData.append("project_id", projectId);
      formData.append("chunk_index", String(index));
      formData.append("file", blob, `chunk_${index}.webm`);

      pendingChunksRef.current += 1;
      setPendingChunks((prev) => prev + 1);

      try {
        const res = await fetch("/api/audio/chunk", {
          method: "POST",
          body: formData,
          credentials: "include"
        });
        const data = await res.json();

        if (res.status === 403 && data.error === "Tiempo de grabación agotado") {
          quotaExceededRef.current = true;
          onQuotaExceeded?.();
          return false;
        }

        if (data.ok && data.text) {
          onChunkText?.(data.text);
        }
        return data.ok;
      } catch (err) {
        console.warn("sendChunk error:", err);
        return false;
      } finally {
        pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
        setPendingChunks((prev) => Math.max(0, prev - 1));
      }
    },
    [onChunkText, onQuotaExceeded]
  );

  // Graba un chunk completo con su propio MediaRecorder
  const recordOneChunk = useCallback(
    (index, projectId) => {
      if (!isRecordingRef.current || quotaExceededRef.current) return;

      const audioStream = getAudioStream?.();
      if (!audioStream || !audioStream.active) {
        console.warn("recordOneChunk: audio stream not active");
        return;
      }

      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length === 0 || audioTracks.some((t) => t.readyState !== "live")) {
        console.warn("recordOneChunk: audio tracks not live");
        return;
      }

      const mimeType = findMimeType();
      if (!mimeType) {
        console.warn("recordOneChunk: no supported mime type");
        return;
      }

      const chunks = [];
      const recorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 64000
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mimeType });
          if (blob.size > 500) {
            await sendChunk(blob, index, projectId);
          }
        }
      };

      recorder.start();
      onChunkIndex?.(index + 1);

      // Detener este chunk después de chunkDuration segundos
      chunkTimeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, chunkDuration * 1000);
    },
    [getAudioStream, chunkDuration, findMimeType, sendChunk, onChunkIndex]
  );

  const startChunkCycle = useCallback(
    (startIndex = 0, projectId) => {
      if (!projectId) {
        console.error("startChunkCycle: projectId is required");
        return;
      }

      const audioStream = getAudioStream?.();
      if (!audioStream || !audioStream.active) {
        console.error("startChunkCycle: audio stream not active");
        return;
      }

      const mimeType = findMimeType();
      if (!mimeType) {
        console.error("startChunkCycle: no supported mime type");
        return;
      }

      projectIdRef.current = projectId;
      chunkIndexRef.current = startIndex;
      isRecordingRef.current = true;
      quotaExceededRef.current = false;

      // Función para iniciar cada chunk
      const tick = () => {
        if (!isRecordingRef.current || quotaExceededRef.current) {
          return;
        }
        const currentIndex = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        recordOneChunk(currentIndex, projectId);
      };

      // Primer chunk inmediatamente
      tick();

      // Siguientes chunks cada chunkDuration segundos
      intervalRef.current = setInterval(tick, chunkDuration * 1000);
    },
    [getAudioStream, chunkDuration, findMimeType, recordOneChunk]
  );

  const stopChunkCycle = useCallback(async (flush = true) => {
    isRecordingRef.current = false;

    // Limpiar interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Limpiar timeout del chunk actual
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }

    // Detener el recorder actual si está grabando
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      if (flush) {
        // Solicitar datos pendientes antes de detener
        try {
          recorder.requestData();
        } catch (err) {
          // ignore
        }
      }
      recorder.stop();
    }
    recorderRef.current = null;

    // Esperar a que todos los chunks pendientes se envíen
    return new Promise((resolve) => {
      const check = () => {
        if (pendingChunksRef.current <= 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      // Dar tiempo para que el onstop se procese
      setTimeout(check, 200);
    });
  }, []);

  const isQuotaExceeded = useCallback(() => quotaExceededRef.current, []);

  return {
    startChunkCycle,
    stopChunkCycle,
    pendingChunks,
    isQuotaExceeded
  };
}
