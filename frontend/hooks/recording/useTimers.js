import { useCallback, useEffect, useRef, useState } from "react";

export function useTimers() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef(null);
  const pausedAccumRef = useRef(0);
  const intervalRef = useRef(null);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    pausedAccumRef.current = 0;
    setElapsedSeconds(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current || Date.now()) - pausedAccumRef.current;
      setElapsedSeconds(Math.max(0, Math.floor(elapsed / 1000)));
    }, 500);
  }, []);

  const pause = useCallback(() => {
    if (!startTimeRef.current) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const elapsed = Date.now() - startTimeRef.current - pausedAccumRef.current;
    pausedAccumRef.current = elapsed;
  }, []);

  const resume = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current || Date.now()) - pausedAccumRef.current;
      setElapsedSeconds(Math.max(0, Math.floor(elapsed / 1000)));
    }, 500);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
    pausedAccumRef.current = 0;
    setElapsedSeconds(0);
  }, []);

  const formatTimer = useCallback(() => {
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = Math.floor(elapsedSeconds % 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [elapsedSeconds]);

  useEffect(() => () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  return {
    elapsedSeconds,
    start,
    pause,
    resume,
    stop,
    formatTimer
  };
}
