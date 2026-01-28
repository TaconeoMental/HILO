import { useCallback, useRef, useState } from "react";

export function usePhotos({ projectId, videoRef, stylize, onQuotaExceeded, getElapsedMs }) {
  const [photos, setPhotos] = useState([]);
  const [photoDelay, setPhotoDelay] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const quotaExceededRef = useRef(false);

  const setQuotaExceeded = useCallback((exceeded) => {
    quotaExceededRef.current = exceeded;
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!projectId || !videoRef.current || isCapturing) return;
    if (quotaExceededRef.current) {
      console.warn("capturePhoto: quota exceeded, blocking");
      return;
    }

    setIsCapturing(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo capturar la foto");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      const photoId = crypto.randomUUID();
      const tMs = getElapsedMs ? getElapsedMs() : Date.now();
      const res = await fetch("/api/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project_id: projectId,
          photo_id: photoId,
          t_ms: tMs,
          data_url: dataUrl
        })
      });
      const data = await res.json();

      // Detectar cuota agotada
      if (res.status === 403 && data.error === "Tiempo de grabación agotado") {
        quotaExceededRef.current = true;
        onQuotaExceeded?.();
        return;
      }

      if (!data.ok) {
        throw new Error(data.error || "No se pudo guardar la foto");
      }
      setPhotos((prev) => [
        { id: photoId, previewUrl: dataUrl, tMs },
        ...prev
      ]);
    } finally {
      setIsCapturing(false);
    }
  }, [projectId, videoRef, stylize, isCapturing, onQuotaExceeded, getElapsedMs]);

  const captureWithDelay = useCallback(() => {
    if (quotaExceededRef.current) return;
    if (photoDelay <= 0) {
      capturePhoto();
      return;
    }
    setTimeout(() => {
      capturePhoto();
    }, photoDelay * 1000);
  }, [photoDelay, capturePhoto]);

  return {
    photos,
    setPhotos,
    photoDelay,
    setPhotoDelay,
    capturePhoto: captureWithDelay,
    isCapturing,
    setQuotaExceeded
  };
}
