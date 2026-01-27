import { useCallback, useEffect, useState } from "react";

export function useQuotas() {
  const [recordingLimitSeconds, setRecordingLimitSeconds] = useState(null);
  const [recordingTotalSeconds, setRecordingTotalSeconds] = useState(null);
  const [noMinutesOpen, setNoMinutesOpen] = useState(false);
  const [noMinutesTitle, setNoMinutesTitle] = useState("Sin minutos disponibles");
  const [noMinutesSubtitle, setNoMinutesSubtitle] = useState("Te quedaste sin minutos de grabación.");
  const [noMinutesCountdown, setNoMinutesCountdown] = useState("");
  const [resetAt, setResetAt] = useState(null);

  const updateFromStart = useCallback((data) => {
    setRecordingLimitSeconds(data.recording_remaining_seconds ?? null);
    setRecordingTotalSeconds(data.recording_total_seconds ?? null);
    setResetAt(data.recording_reset_at ? new Date(data.recording_reset_at) : null);
  }, []);

  const openNoMinutes = useCallback((resetDate) => {
    setResetAt(resetDate);
    setNoMinutesOpen(true);
  }, []);

  const closeNoMinutes = useCallback(() => {
    setNoMinutesOpen(false);
    setNoMinutesCountdown("");
  }, []);

  useEffect(() => {
    if (!noMinutesOpen || !resetAt) return undefined;
    const interval = setInterval(() => {
      const diffMs = resetAt.getTime() - Date.now();
      if (diffMs <= 0) {
        setNoMinutesCountdown("Puedes intentar de nuevo.");
        clearInterval(interval);
        return;
      }
      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      setNoMinutesCountdown(`Vuelve a intentarlo en ${minutes}m ${seconds}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [noMinutesOpen, resetAt]);

  return {
    recordingLimitSeconds,
    recordingTotalSeconds,
    updateFromStart,
    openNoMinutes,
    closeNoMinutes,
    noMinutesOpen,
    noMinutesTitle,
    noMinutesSubtitle,
    noMinutesCountdown
  };
}
