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
  const collectedChunksRef = useRef([]);
  const isRecordingRef = useRef(false);
  const quotaExceededRef = useRef(false);

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

  const flushCollectedChunks = useCallback(async () => {
    const chunks = collectedChunksRef.current;
    if (chunks.length === 0) return;

    const mimeType = findMimeType() || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });
    collectedChunksRef.current = [];

    if (blob.size < 500) return;

    const index = chunkIndexRef.current;
    chunkIndexRef.current += 1;
    onChunkIndex?.(chunkIndexRef.current);

    await sendChunk(blob, index, projectIdRef.current);
  }, [findMimeType, sendChunk, onChunkIndex]);

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
      collectedChunksRef.current = [];
      isRecordingRef.current = true;
      quotaExceededRef.current = false;

      const recorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 64000
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          collectedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        isRecordingRef.current = false;
      };

      // Usar timeslice para obtener datos continuamente
      const timesliceMs = chunkDuration * 1000;
      recorder.start(timesliceMs);

      // Enviar chunks cada chunkDuration segundos
      const intervalId = setInterval(async () => {
        if (!isRecordingRef.current || quotaExceededRef.current) {
          clearInterval(intervalId);
          return;
        }
        await flushCollectedChunks();
      }, timesliceMs);

      // Guardar referencia al interval para poder limpiarlo
      recorder._chunkIntervalId = intervalId;

      onChunkIndex?.(startIndex);
    },
    [getAudioStream, chunkDuration, findMimeType, flushCollectedChunks, onChunkIndex]
  );

  const stopChunkCycle = useCallback(async (flush = true) => {
    isRecordingRef.current = false;

    const recorder = recorderRef.current;
    if (recorder) {
      if (recorder._chunkIntervalId) {
        clearInterval(recorder._chunkIntervalId);
        recorder._chunkIntervalId = null;
      }

      if (recorder.state === "recording") {
        // Solicitar datos pendientes antes de detener
        try {
          recorder.requestData();
        } catch (err) {
          // ignore
        }
        recorder.stop();
      }
      recorderRef.current = null;
    }

    // Enviar el chunk final si hay datos pendientes
    if (flush && !quotaExceededRef.current) {
      await flushCollectedChunks();
    }

    // Esperar a que todos los chunks pendientes se envíen
    return new Promise((resolve) => {
      const check = () => {
        if (pendingChunksRef.current <= 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }, [flushCollectedChunks]);

  const isQuotaExceeded = useCallback(() => quotaExceededRef.current, []);

  return {
    startChunkCycle,
    stopChunkCycle,
    pendingChunks,
    isQuotaExceeded
  };
}
