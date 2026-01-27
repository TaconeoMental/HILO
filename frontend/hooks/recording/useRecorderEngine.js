import { useCallback, useRef, useState } from "react";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus"
];

export function useRecorderEngine({
  audioStream,
  chunkDuration,
  projectId,
  onChunkText,
  onChunkIndex
}) {
  const [pendingChunks, setPendingChunks] = useState(0);
  const recorderRef = useRef(null);
  const intervalRef = useRef(null);

  const findMimeType = useCallback(() => {
    for (const type of MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }, []);

  const sendChunk = useCallback(
    async (blob, index) => {
      const formData = new FormData();
      formData.append("project_id", projectId);
      formData.append("chunk_index", String(index));
      formData.append("file", blob, `chunk_${index}.webm`);
      const res = await fetch("/api/audio/chunk", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      const data = await res.json();
      if (data.ok && data.text) {
        onChunkText?.(data.text);
      }
    },
    [projectId, onChunkText]
  );

  const recordOneChunk = useCallback(
    async (index) => {
      if (!audioStream) return;
      const mimeType = findMimeType();
      if (!mimeType) {
        throw new Error("Navegador no soporta grabación de audio");
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
            setPendingChunks((prev) => prev + 1);
            try {
              await sendChunk(blob, index);
            } finally {
              setPendingChunks((prev) => Math.max(0, prev - 1));
            }
          }
        }
      };
      recorder.start();
      onChunkIndex?.(index + 1);

      const recordMs = (chunkDuration * 1000) - 500;
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, recordMs);
    },
    [audioStream, chunkDuration, findMimeType, sendChunk]
  );

  const startChunkCycle = useCallback(
    (startIndex = 0) => {
      if (!audioStream) return;
      let chunkIndex = startIndex;
      const intervalMs = chunkDuration * 1000;
      const tick = async () => {
        try {
          await recordOneChunk(chunkIndex);
        } catch (err) {
          console.warn("chunk error", err);
        }
        chunkIndex += 1;
      };
      tick();
      intervalRef.current = setInterval(tick, intervalMs);
      return () => chunkIndex;
    },
    [audioStream, chunkDuration, recordOneChunk]
  );

  const stopChunkCycle = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch (err) {
        // ignore
      }
      recorder.stop();
    }
    return new Promise((resolve) => {
      const check = () => {
        if (pendingChunks <= 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }, [pendingChunks]);

  return {
    startChunkCycle,
    stopChunkCycle,
    pendingChunks
  };
}
