import os
from config import Config
from helpers import load_prompt
from logger import get_logger
from services.openai_client import get_openai_client

log = get_logger("llm")


def generate_script(transcript_with_markers, participant_name="ACTOR"):
    script, _usage = generate_script_with_usage(
        transcript_with_markers,
        participant_name
    )
    return script


def generate_script_with_usage(transcript_with_markers, participant_name="ACTOR"):
    client = get_openai_client()
    if not client:
        log.warning("Cliente OpenAI no disponible, retornando raw")
        return transcript_with_markers, None

    try:
        log.info(f"Generando guion para {participant_name}...")

        user_content = (
            f"Nombre del participante (usar tal cual): {participant_name}\n\n"
            f"Transcripción:\n{transcript_with_markers}"
        )

        response = client.chat.completions.create(
            model=Config.LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": load_prompt("script_generation")
                },
                {"role": "user", "content": user_content}
            ],
            temperature=0.3,
            max_tokens=4000
        )

        result = response.choices[0].message.content.strip()
        usage = None
        if getattr(response, "usage", None):
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
        log.info("Guion generado exitosamente")
        return result, usage

    except Exception as e:
        log.error(f"Generación LLM falló: {e}")
        return transcript_with_markers, None


def insert_photo_markers(transcript, photos, chunks):
    """
    Inserta marcadores [[FOTO:<id>]] en la transcripción según timestamps.

    Para cada foto (ordenadas por t_ms):
    - Insertar después del chunk cuyo tiempo final sea <= photo.t_ms
    """
    if not photos:
        return transcript

    # Calcular tiempos acumulados por chunk
    chunk_times = []
    accumulated_ms = 0
    chunk_duration_ms = Config.CHUNK_DURATION * 1000

    for i, chunk in enumerate(chunks):
        t0 = accumulated_ms
        t1 = accumulated_ms + chunk_duration_ms
        chunk_times.append({
            "index": i,
            "t0_ms": t0,
            "t1_ms": t1,
            "text": chunk.get("text", "")
        })
        accumulated_ms = t1

    # Construir transcripción con marcadores
    result_parts = []
    photo_queue = list(photos)

    for ct in chunk_times:
        result_parts.append(ct["text"])

        # Insertar fotos cuyo t_ms <= t1_ms de este chunk
        while photo_queue and photo_queue[0]["t_ms"] <= ct["t1_ms"]:
            photo = photo_queue.pop(0)
            result_parts.append(f" [[FOTO:{photo['photo_id']}]] ")

    # Insertar fotos restantes al final
    for photo in photo_queue:
        result_parts.append(f" [[FOTO:{photo['photo_id']}]] ")

    return " ".join(result_parts)


def replace_markers_with_images(script, photos):
    """
    Reemplaza [[FOTO:<id>]] con sintaxis Markdown de imagen.
    Usa imagen estilizada si existe, si no la original.
    """
    for photo in photos:
        marker = f"[[FOTO:{photo['photo_id']}]]"
        # Preferir estilizada, si no original
        img_path = photo.get("stylized_path") or photo.get("original_path")
        if img_path:
            # Usar path relativo para el markdown
            img_name = os.path.basename(img_path)
            img_md = f"\n\n![Foto]({img_name})\n\n"
            script = script.replace(marker, img_md)

    return script
