import { useCallback, useEffect, useRef, useState } from "react";

export function useCanvasPreview({
  videoRef,
  canvasRef,
  active,
  facingMode,
  orientation
}) {
  const loopRef = useRef(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setReady(false);
  }, [canvasRef]);

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) {
      setReady(false);
      loopRef.current = requestAnimationFrame(draw);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      setReady(false);
      loopRef.current = requestAnimationFrame(draw);
      return;
    }

    setReady(true);

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
  }, [videoRef, canvasRef, facingMode, orientation]);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    loopRef.current = requestAnimationFrame(draw);
    return () => stop();
  }, [active, draw, stop]);

  return { stop, ready };
}
