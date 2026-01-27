import { useCallback, useEffect, useState } from "react";

export function useQuotas() {
  const [recordingLimitSeconds, setRecordingLimitSeconds] = useState(null);
  const [recordingTotalSeconds, setRecordingTotalSeconds] = useState(null);
  const [recordingWindowDays, setRecordingWindowDays] = useState(null);
  const [noMinutesOpen, setNoMinutesOpen] = useState(false);
  const [noMinutesTitle, setNoMinutesTitle] = useState("Sin minutos disponibles");
  const [noMinutesSubtitle, setNoMinutesSubtitle] = useState("Te quedaste sin minutos de grabación.");
  const [noMinutesCountdown, setNoMinutesCountdown] = useState("");
  const [resetAt, setResetAt] = useState(null);

  // Estado para modal de cuota alcanzada durante grabación
  const [quotaReachedOpen, setQuotaReachedOpen] = useState(false);
  const [quotaReachedCountdown, setQuotaReachedCountdown] = useState("");

  const updateFromStart = useCallback((data) => {
    setRecordingLimitSeconds(data.recording_remaining_seconds ?? null);
    setRecordingTotalSeconds(data.recording_total_seconds ?? null);
    setRecordingWindowDays(data.recording_window_days ?? null);
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

  const openQuotaReached = useCallback(() => {
    setQuotaReachedOpen(true);
  }, []);

  const closeQuotaReached = useCallback(() => {
    setQuotaReachedOpen(false);
    setQuotaReachedCountdown("");
  }, []);

  // Countdown para modal de sin minutos (al inicio)
  useEffect(() => {
    if (!noMinutesOpen || !resetAt) return undefined;
    const interval = setInterval(() => {
      const diffMs = resetAt.getTime() - Date.now();
      if (diffMs <= 0) {
        setNoMinutesCountdown("Puedes intentar de nuevo.");
        clearInterval(interval);
        return;
      }
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      if (hours > 0) {
        setNoMinutesCountdown(`Se resetea en ${hours}h ${minutes}m`);
      } else {
        setNoMinutesCountdown(`Se resetea en ${minutes}m ${seconds}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [noMinutesOpen, resetAt]);

  // Countdown para modal de cuota alcanzada durante grabación
  useEffect(() => {
    if (!quotaReachedOpen || !resetAt) return undefined;
    const interval = setInterval(() => {
      const diffMs = resetAt.getTime() - Date.now();
      if (diffMs <= 0) {
        setQuotaReachedCountdown("Tu cuota ya se ha reseteado.");
        clearInterval(interval);
        return;
      }
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      if (hours > 0) {
        setQuotaReachedCountdown(`Se resetea en ${hours}h ${minutes}m`);
      } else {
        setQuotaReachedCountdown(`Se resetea en ${minutes}m ${seconds}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [quotaReachedOpen, resetAt]);

  // Mensaje para cuando no hay fecha de reset
  const getNoResetMessage = useCallback(() => {
    return "Habla con tu administrador para aumentar tu cuota de grabación.";
  }, []);

  return {
    recordingLimitSeconds,
    recordingTotalSeconds,
    recordingWindowDays,
    resetAt,
    updateFromStart,
    openNoMinutes,
    closeNoMinutes,
    noMinutesOpen,
    noMinutesTitle,
    noMinutesSubtitle,
    noMinutesCountdown,
    // Cuota alcanzada durante grabación
    quotaReachedOpen,
    openQuotaReached,
    closeQuotaReached,
    quotaReachedCountdown,
    getNoResetMessage
  };
}
