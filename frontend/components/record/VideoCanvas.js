"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// Stable, isolated canvas+video renderer. No UI overlays here.
// Starts drawing only after video has real frames. Uses ResizeObserver on a stable wrapper.

export default React.memo(function VideoCanvas({
  stream,
  facingMode,
  orientation,
  fullScreen = false,
  className = "",
  videoRef: externalVideoRef,
  canvasRef: externalCanvasRef
}) {
  const videoRef = externalVideoRef || useRef(null);
  const canvasRef = externalCanvasRef || useRef(null);
  const loopRef = useRef(null);
  const isDrawingRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const lockUntilRef = useRef(0);
  const observerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Assign stream as soon as DOM is ready
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
  }, [stream]);

  // Force play when metadata arrives
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onMeta = () => {
      video.play?.().catch(() => {});
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("canplay", onMeta);

    // If already ready
    if (video.readyState >= 2) {
      onMeta();
    }

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("canplay", onMeta);
    };
  }, [stream]);

  // ResizeObserver on stable parent
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    if (!parent) return undefined;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (Date.now() < lockUntilRef.current) return;
        const rect = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        sizeRef.current = { width, height, dpr };
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
    });
    observer.observe(parent);
    observerRef.current = observer;
    return () => observer.disconnect();
  }, []);

  const stopLoop = () => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    isDrawingRef.current = false;
    setReady(false);
  };

  const draw = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Wait for frames
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setReady(false);
      loopRef.current = requestAnimationFrame(draw);
      return;
    }

    if (isDrawingRef.current && !ready) setReady(true);

    const { width, height, dpr } = sizeRef.current;
    if (!width || !height) {
      loopRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Always maintain portrait orientation - no rotation applied to video
    // Video will show with black bars when device is in landscape
    const scale = Math.min(width / vw, height / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    const offsetX = (width - drawW) / 2;
    const offsetY = (height - drawH) / 2;

    ctx.save();
    if (facingMode === "user") {
      // Mirror horizontally for front camera
      ctx.translate(offsetX + drawW, offsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, vw, vh, 0, 0, drawW, drawH);
    } else {
      // No mirroring for rear camera
      ctx.drawImage(video, 0, 0, vw, vh, offsetX, offsetY, drawW, drawH);
    }
    ctx.restore();
    loopRef.current = requestAnimationFrame(draw);
  };

  // Start loop once video has frames
  useEffect(() => {
    if (!stream) {
      stopLoop();
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;

    // Clear canvas when stream or orientation changes to prevent visual artifacts
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    const startLoop = () => {
      if (isDrawingRef.current) return;
      isDrawingRef.current = true;
      loopRef.current = requestAnimationFrame(draw);
    };

    const onReady = () => {
      if (video && video.videoWidth && video.videoHeight) {
        lockUntilRef.current = Date.now() + (isMobile ? 900 : 0);
        startLoop();
      }
    };

    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      const cb = () => {
        onReady();
      };
      try {
        video?.requestVideoFrameCallback?.(() => cb());
      } catch (err) {
        video?.addEventListener("playing", onReady, { once: true });
      }
    }

    video?.addEventListener("loadedmetadata", onReady, { once: true });
    video?.addEventListener("playing", onReady, { once: true });
    if (video?.readyState >= 2 && video.videoWidth && video.videoHeight) {
      onReady();
    }

    return () => {
      stopLoop();
    };
  }, [stream, facingMode]); // Removed orientation dependency since video never rotates

  const mirrored = facingMode === "user";

  return (
    <div className={`${fullScreen ? "relative h-full w-full" : "relative"} ${className}`.trim()}>
      <video
        ref={videoRef}
        className={`${fullScreen ? "absolute inset-0 h-full w-full" : "absolute inset-0 h-full w-full"} ${
          fullScreen ? "object-cover" : "object-contain"
        } ${mirrored ? "-scale-x-100" : ""}`}
        autoPlay
        muted
        playsInline
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${stream && ready ? "block" : "hidden"}`}
      />
    </div>
  );
});
