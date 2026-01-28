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
    Inserta marcadores [[FOTO:<id>]] en la transcripción según el índice de chunk.

    Cada foto incluye el campo after_chunk_index que indica después de qué chunk
    debe insertarse. Los chunks y fotos se ordenan para mantener la secuencia de
    la grabación.
    """
    if not photos:
        return transcript

    # Mapear fotos por índice de chunk
    photos_by_chunk = {}
    for photo in sorted(
        photos,
        key=lambda p: (p.get("after_chunk_index", -1), p.get("t_ms", 0))
    ):
        idx = photo.get("after_chunk_index")
        if idx is None:
            # Si no hay índice, agregar al final
            idx = -1
        photos_by_chunk.setdefault(idx, []).append(photo)

    result_parts = []
    sorted_chunks = sorted(chunks, key=lambda c: c.get("index", 0))

    for chunk in sorted_chunks:
        chunk_index = chunk.get("index", 0)
        chunk_text = chunk.get("text", "")
        if chunk_text:
            result_parts.append(chunk_text)

        for photo in photos_by_chunk.get(chunk_index, []):
            result_parts.append(f" [[FOTO:{photo['photo_id']}]] ")

    # Fotos que no tengan índice asociado se agregan al final
    for photo in photos_by_chunk.get(-1, []):
        result_parts.append(f" [[FOTO:{photo['photo_id']}]] ")

    return " ".join(part for part in result_parts if part)


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
