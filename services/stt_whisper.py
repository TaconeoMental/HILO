import os
import whisper

from config import Config
from logger import get_logger

log = get_logger("stt")

_model = None


def get_model():
    global _model
    if _model is None:
        model_name = Config.WHISPER_MODEL
        log.info(f"Cargando modelo Whisper: {model_name}")
        _model = whisper.load_model(model_name)
        log.info("Modelo Whisper cargado")
    return _model


def transcribe_wav(wav_path):
    if not os.path.exists(wav_path):
        log.warning(f"Archivo WAV no encontrado: {wav_path}")
        return ""

    try:
        model = get_model()

        lang = Config.WHISPER_LANGUAGE
        if lang == "auto":
            lang = None

        result = model.transcribe(
            wav_path,
            language=lang,
            fp16=False
        )

        return result.get("text", "").strip()

    except Exception as e:
        log.error(f"Transcripción fallida: {e}")
        return ""
