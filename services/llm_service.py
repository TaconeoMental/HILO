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
            f"Nombre del participante: {participant_name}\n\n"
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
