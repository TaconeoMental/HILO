import { useCallback, useEffect, useRef, useState } from "react";

export function usePhotos({
  projectId,
  videoRef,
  stylize,
  onQuotaExceeded,
  getElapsedMs,
  getOrientation
}) {
  const [photos, setPhotos] = useState([]);
  const [photoDelay, setPhotoDelay] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdownValue, setCountdownValue] = useState(0);
  const [countdownActive, setCountdownActive] = useState(false);
  const quotaExceededRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const countdownTimeoutRef = useRef(null);
  const canvasRef = useRef(null);
  const [flashKey, setFlashKey] = useState(0);

  const setQuotaExceeded = useCallback((exceeded) => {
    quotaExceededRef.current = exceeded;
  }, []);

  const stopCountdown = useCallback((resetDisplay = true) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    if (resetDisplay) {
      setCountdownActive(false);
      setCountdownValue(0);
    }
  }, []);

  const capturePhotoNow = useCallback(async (fromCountdown = false) => {
    if (isCapturing || quotaExceededRef.current) {
      return;
    }

    const currentProjectId = projectId;
    if (!currentProjectId || !videoRef.current) {
      return;
    }

    if (fromCountdown) {
      stopCountdown(false);
    } else {
      stopCountdown(true);
    }
    setIsCapturing(true);
    try {
      const video = videoRef.current;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      const canvas = canvasRef.current;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;

      const orientation = getOrientation ? getOrientation() : "portrait";

      canvas.width = vw;
      canvas.height = vh;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("No se pudo capturar la foto");
      }

      ctx.clearRect(0, 0, vw, vh);
      ctx.drawImage(video, 0, 0, vw, vh);

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
          photo_orientation: orientation
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
          stylize
        },
        ...prev
      ]);
      setFlashKey((prev) => prev + 1);
    } catch (err) {
      console.error("Error capturando foto:", err);
    } finally {
      setIsCapturing(false);
      if (fromCountdown) {
        setCountdownActive(false);
        setCountdownValue(0);
      }
    }
   }, [projectId, videoRef, getElapsedMs, onQuotaExceeded, stylize, stopCountdown, isCapturing, getOrientation]);

  const capturePhoto = useCallback(() => {
    if (quotaExceededRef.current || countdownActive || isCapturing) {
      return;
    }

    const delaySeconds = Number(photoDelay) || 0;

    if (delaySeconds <= 0) {
      void capturePhotoNow(false);
      return;
    }

    stopCountdown(true);
    setCountdownActive(true);
    setCountdownValue(delaySeconds);

    let remaining = delaySeconds;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setCountdownValue((prev) => {
        const nextValue = Math.max(remaining, 1);
        return remaining >= 1 ? nextValue : prev;
      });
      if (remaining <= 1 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setCountdownValue(1);
      }
    }, 1000);

    countdownTimeoutRef.current = setTimeout(() => {
      stopCountdown(false);
      void capturePhotoNow(true);
    }, delaySeconds * 1000);
  }, [capturePhotoNow, photoDelay, countdownActive, isCapturing, stopCountdown]);

  useEffect(() => {
    return () => {
      stopCountdown(true);
    };
  }, [stopCountdown]);

  return {
    photos,
    setPhotos,
    photoDelay,
    setPhotoDelay,
    capturePhoto,
    isCapturing,
    setQuotaExceeded,
    countdownActive,
    countdownValue,
    flashKey
  };
}
