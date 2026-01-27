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
    let rotation = 0;
    if (orientation === "landscape-left") rotation = Math.PI / 2;
    if (orientation === "landscape-right") rotation = -Math.PI / 2;

    ctx.save();
    if (rotation === Math.PI / 2) {
      ctx.translate(width, 0);
      ctx.rotate(rotation);
    } else if (rotation === -Math.PI / 2) {
      ctx.translate(0, height);
      ctx.rotate(rotation);
    }

    const rotW = rotation === 0 ? vw : vh;
    const rotH = rotation === 0 ? vh : vw;
    const renderW = rotation === 0 ? width : height;
    const renderH = rotation === 0 ? height : width;
    const scale = Math.min(renderW / rotW, renderH / rotH);
    const drawW = rotW * scale;
    const drawH = rotH * scale;
    const offsetX = (renderW - drawW) / 2;
    const offsetY = (renderH - drawH) / 2;

    if (facingMode === "user") {
      ctx.translate(offsetX + drawW, offsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, vw, vh, 0, 0, drawW, drawH);
    } else {
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
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;

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
  }, [stream, facingMode, orientation]);

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
