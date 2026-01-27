import { useCallback, useState } from "react";

export function useMediaStreams() {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState("user");

  const start = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Cámara no disponible.");
    }
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: true
    });
    setStream(newStream);
    return newStream;
  }, [facingMode]);

  const stop = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  }, [stream]);

  const switchCamera = useCallback(async () => {
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);
    if (!stream) {
      return;
    }
    try {
      const currentVideoTrack = stream.getVideoTracks()[0];
      if (currentVideoTrack) {
        currentVideoTrack.stop();
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (currentVideoTrack) {
        stream.removeTrack(currentVideoTrack);
      }
      if (newVideoTrack) {
        stream.addTrack(newVideoTrack);
      }
      setStream(stream);
    } catch (err) {
      setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
      throw err;
    }
  }, [facingMode, stream]);

  return {
    stream,
    facingMode,
    setFacingMode,
    start,
    stop,
    switchCamera
  };
}
