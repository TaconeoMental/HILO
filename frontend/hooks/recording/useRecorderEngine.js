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
  const forceStopPromiseRef = useRef(null);

  const findMimeType = useCallback(() => {
    for (const type of MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }, []);

  const waitForPendingChunks = useCallback((timeoutMs = 10000) => {
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

      chunkTimeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, chunkDuration * 1000);
    },
    [getAudioStream, chunkDuration, findMimeType, sendChunk, onChunkIndex]
  );

  const startNextChunk = useCallback(
    (projectId) => {
      if (!isRecordingRef.current || quotaExceededRef.current) {
        return;
      }

      const nextIndex = chunkIndexRef.current;
      chunkIndexRef.current += 1;
      recordOneChunk(nextIndex, projectId);
    },
    [recordOneChunk]
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

      startNextChunk(projectId);
      intervalRef.current = setInterval(
        () => startNextChunk(projectId),
        chunkDuration * 1000
      );
    },
    [getAudioStream, chunkDuration, findMimeType, startNextChunk]
  );

  const forceStopCurrentChunk = useCallback(async () => {
    if (!isRecordingRef.current) {
      return Math.max(0, chunkIndexRef.current - 1);
    }

    if (forceStopPromiseRef.current) {
      return forceStopPromiseRef.current;
    }

    const promise = (async () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (chunkTimeoutRef.current) {
        clearTimeout(chunkTimeoutRef.current);
        chunkTimeoutRef.current = null;
      }

      const currentIndex = Math.max(0, chunkIndexRef.current - 1);
      const recorder = recorderRef.current;

      if (recorder && recorder.state === "recording") {
        const flushPromise = new Promise((resolve) => {
          const originalOnStop = recorder.onstop;
          recorder.onstop = async (event) => {
            if (originalOnStop) {
              await originalOnStop(event);
            }
            resolve();
          };
        });

        try {
          recorder.requestData();
        } catch (err) {
          // ignore
        }
        recorder.stop();
        await flushPromise;
      }

      await waitForPendingChunks();
      recorderRef.current = null;
      forceStopPromiseRef.current = null;
      return currentIndex;
    })();

    forceStopPromiseRef.current = promise;
    return promise;
  }, [waitForPendingChunks]);

  const resumeAfterPhoto = useCallback((projectId) => {
    const targetProjectId = projectId || projectIdRef.current;
    if (!targetProjectId) {
      return;
    }

    if (quotaExceededRef.current) {
      return;
    }

    isRecordingRef.current = true;
    startNextChunk(targetProjectId);
    intervalRef.current = setInterval(
      () => startNextChunk(targetProjectId),
      chunkDuration * 1000
    );
  }, [chunkDuration, startNextChunk]);

  const stopChunkCycle = useCallback(async (flush = true) => {
    isRecordingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      if (flush) {
        try {
          recorder.requestData();
        } catch (err) {
          // ignore
        }
      }
      recorder.stop();
    }
    recorderRef.current = null;

    if (!flush) {
      return;
    }

    await waitForPendingChunks(15000);
  }, [waitForPendingChunks]);

  const isQuotaExceeded = useCallback(() => quotaExceededRef.current, []);

  const getCurrentChunkIndex = useCallback(() => {
    return Math.max(0, chunkIndexRef.current - 1);
  }, []);

  const getProjectId = useCallback(() => projectIdRef.current, []);

  return {
    startChunkCycle,
    stopChunkCycle,
    forceStopCurrentChunk,
    resumeAfterPhoto,
    getCurrentChunkIndex,
    getProjectId,
    pendingChunks,
    isQuotaExceeded
  };
}
