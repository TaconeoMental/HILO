import { useCallback, useRef, useState } from "react";

function isActive(stream) {
  return Boolean(stream && stream.active);
}

export function useMediaStreams() {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const streamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const videoStreamRef = useRef(null);

  const setStreamState = useCallback((nextStream) => {
    streamRef.current = nextStream;
    setStream(nextStream);
  }, []);

  const stopTracks = useCallback((targetStream) => {
    if (targetStream) {
      targetStream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const ensureAudioStream = useCallback(async () => {
    const currentAudio = audioStreamRef.current;
    if (isActive(currentAudio) && currentAudio.getAudioTracks().length > 0) {
      return currentAudio;
    }
    const freshAudio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioStreamRef.current = freshAudio;
    return freshAudio;
  }, []);

  const createVideoStream = useCallback(async (targetFacingMode) => {
    stopTracks(videoStreamRef.current);
    const freshVideo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: targetFacingMode },
      audio: false
    });
    videoStreamRef.current = freshVideo;
    return freshVideo;
  }, [stopTracks]);

  const rebuildCombinedStream = useCallback(() => {
    const tracks = [];
    if (audioStreamRef.current) {
      tracks.push(...audioStreamRef.current.getAudioTracks());
    }
    if (videoStreamRef.current) {
      tracks.push(...videoStreamRef.current.getVideoTracks());
    }
    const combined = new MediaStream(tracks);
    setStreamState(combined);
    return combined;
  }, [setStreamState]);

  const startStream = useCallback(async ({ audio = true } = {}) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Cámara no disponible.");
    }
    if (audio) {
      await ensureAudioStream();
    }
    await createVideoStream(facingMode);
    return rebuildCombinedStream();
  }, [createVideoStream, ensureAudioStream, facingMode, rebuildCombinedStream]);

  const startPreview = useCallback(() => startStream({ audio: true }), [startStream]);
  const startRecording = useCallback(() => startStream({ audio: true }), [startStream]);

  const stop = useCallback(() => {
    stopTracks(videoStreamRef.current);
    stopTracks(audioStreamRef.current);
    videoStreamRef.current = null;
    audioStreamRef.current = null;
    setStreamState(null);
  }, [setStreamState, stopTracks]);

  const switchCamera = useCallback(async (onOrientationReset) => {
    if (!videoStreamRef.current || videoStreamRef.current.getVideoTracks().length === 0) return;

    const nextFacing = facingMode === "user" ? "environment" : "user";

    stopTracks(videoStreamRef.current);

    await new Promise((resolve) => setTimeout(resolve, 50));

    setFacingMode(nextFacing);

    if (onOrientationReset) {
      onOrientationReset();
    }

    await createVideoStream(nextFacing);
    return rebuildCombinedStream();
  }, [createVideoStream, facingMode, rebuildCombinedStream, stopTracks]);

  return {
    stream,
    facingMode,
    setFacingMode,
    startPreview,
    startRecording,
    getStream: () => streamRef.current,
    getAudioStream: () => audioStreamRef.current,
    stop,
    switchCamera
  };
}
