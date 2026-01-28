import { useCallback, useEffect, useRef, useState } from "react";

export function usePhotos({
  projectId,
  videoRef,
  stylize,
  onQuotaExceeded,
  getElapsedMs,
  engine
}) {
  const [photos, setPhotos] = useState([]);
  const [photoDelay, setPhotoDelay] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const quotaExceededRef = useRef(false);
  const delayTimeoutRef = useRef(null);
  const canvasRef = useRef(null);

  const setQuotaExceeded = useCallback((exceeded) => {
    quotaExceededRef.current = exceeded;
  }, []);

  const capturePhotoNow = useCallback(async () => {
    if (isCapturing || quotaExceededRef.current) {
      return;
    }

    const currentProjectId = projectId || engine?.getProjectId?.();
    if (!currentProjectId || !videoRef.current || !engine?.forceStopCurrentChunk) {
      return;
    }

    setIsCapturing(true);
    try {
      const afterChunkIndex = await engine.forceStopCurrentChunk();
      const video = videoRef.current;
      const projectForResume = engine.getProjectId?.() || currentProjectId;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("No se pudo capturar la foto");
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("toBlob retornó nulo"));
          }
        }, "image/jpeg", 0.9);
      });

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const photoId = crypto.randomUUID();
      const timestamp = getElapsedMs ? getElapsedMs() : Date.now();

      const res = await fetch("/api/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project_id: currentProjectId,
          photo_id: photoId,
          t_ms: timestamp,
          data_url: dataUrl,
          after_chunk_index: afterChunkIndex
        })
      });

      const data = await res.json();

      if (res.status === 403 && data.error === "Tiempo de grabación agotado") {
        quotaExceededRef.current = true;
        onQuotaExceeded?.();
        return;
      }

      if (!data.ok) {
        throw new Error(data.error || "No se pudo guardar la foto");
      }

      setPhotos((prev) => [
        {
          id: photoId,
          previewUrl: dataUrl,
          tMs: timestamp,
          afterChunkIndex,
          stylize
        },
        ...prev
      ]);
      if (photoDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, photoDelay * 1000));
      }
      if (!quotaExceededRef.current && projectForResume) {
        engine.resumeAfterPhoto?.(projectForResume);
      }
    } catch (err) {
      console.error("Error capturando foto:", err);
      const projectForResume = engine.getProjectId?.() || projectId;
      if (!quotaExceededRef.current && projectForResume) {
        engine.resumeAfterPhoto?.(projectForResume);
      }
    } finally {
      setIsCapturing(false);
    }
  }, [engine, photoDelay, projectId, videoRef, getElapsedMs, onQuotaExceeded, stylize]);

  const capturePhoto = useCallback(() => {
    if (quotaExceededRef.current) {
      return;
    }

    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }

    if (photoDelay <= 0) {
      void capturePhotoNow();
      return;
    }

    delayTimeoutRef.current = setTimeout(() => {
      delayTimeoutRef.current = null;
      void capturePhotoNow();
    }, photoDelay * 1000);
  }, [capturePhotoNow, photoDelay]);

  useEffect(() => {
    return () => {
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
    };
  }, []);

  return {
    photos,
    setPhotos,
    photoDelay,
    setPhotoDelay,
    capturePhoto,
    isCapturing,
    setQuotaExceeded
  };
}
