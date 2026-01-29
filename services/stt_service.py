import os
from config import Config
from logger import get_logger
from services.openai_client import get_openai_client

log = get_logger("stt")


def transcribe_wav(wav_path):
    if not os.path.exists(wav_path):
        log.warning(f"Archivo WAV no encontrado: {wav_path}")
        return ""

    client = get_openai_client()
    if not client:
        log.warning("Cliente OpenAI no disponible")
        return ""

    try:
        with open(wav_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=audio_file,
                model=Config.TRANSCRIPTION_MODEL
            )

        text = (getattr(response, "text", "") or "").strip()
        log.info(f"Transcripción con OpenAI: {text}")

        return text

    except Exception as e:
        log.error(f"Transcripción fallida: {e}")
        return ""
