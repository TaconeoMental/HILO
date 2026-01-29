import { useCallback, useRef, useState } from "react";

export function useMediaStreams() {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const streamRef = useRef(null);

  const setStreamState = useCallback((nextStream) => {
    streamRef.current = nextStream;
    setStream(nextStream);
  }, []);

  const stopTracks = useCallback((targetStream) => {
    if (targetStream) {
      targetStream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const startStream = useCallback(async ({ audio = true } = {}) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Cámara no disponible.");
    }
    stopTracks(streamRef.current);
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio
    });
    setStreamState(newStream);
    return newStream;
  }, [facingMode, setStreamState, stopTracks]);

  const startPreview = useCallback(() => startStream({ audio: true }), [startStream]);
  const startRecording = useCallback(() => startStream({ audio: true }), [startStream]);

  const stop = useCallback(() => {
    stopTracks(streamRef.current);
    setStreamState(null);
  }, [setStreamState, stopTracks]);

  const switchCamera = useCallback(async (onOrientationReset) => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const hasAudio = currentStream.getAudioTracks().length > 0;
    const nextFacing = facingMode === "user" ? "environment" : "user";

    stopTracks(currentStream);
    setFacingMode(nextFacing);

    // Reset orientation state when switching cameras to prevent residual state
    if (onOrientationReset) {
      onOrientationReset();
    }

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: nextFacing },
      audio: hasAudio
    });
    setStreamState(newStream);
    return newStream;
  }, [facingMode, setStreamState, stopTracks]);

  return {
    stream,
    facingMode,
    setFacingMode,
    startPreview,
    startRecording,
    getStream: () => streamRef.current,
    stop,
    switchCamera
  };
}
