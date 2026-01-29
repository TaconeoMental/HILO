import os
import base64
from config import Config
from helpers import load_prompt
from logger import get_logger
from services.openai_client import get_openai_client

log = get_logger("image")


def stylize_image(input_path, output_path):
    if not Config.IMAGE_STYLE_ENABLED:
        return False

    if not os.path.exists(input_path):
        log.warning(f"Imagen no encontrada: {input_path}")
        return False

    client = get_openai_client()
    if not client:
        log.warning("Cliente OpenAI no disponible para estilización")
        return False

    try:
        with open(input_path, "rb") as image_file:
            log.info(f"Estilizando foto ID={input_path}")
            response = client.images.edit(
                model="gpt-image-1",
                image=image_file,
                prompt=load_prompt("image_stylize"),
                size="1024x1024"
            )
            log.info(f"Fin de estilizado de foto ID={input_path}")

        if hasattr(response.data[0], 'b64_json') and response.data[0].b64_json:
            result_b64 = response.data[0].b64_json
            result_data = base64.b64decode(result_b64)
        elif hasattr(response.data[0], 'url') and response.data[0].url:
            import urllib.request
            with urllib.request.urlopen(response.data[0].url) as resp:
                result_data = resp.read()
        else:
            log.error("Sin datos de imagen en respuesta")
            return False

        with open(output_path, "wb") as f:
            f.write(result_data)

        log.info(f"Imagen estilizada: {output_path}")
        return True

    except Exception as e:
        log.error(f"Error estilizando imagen: {e}")

        if hasattr(e, 'status_code'):
            log.error(f"Status code: {e.status_code}")
        if hasattr(e, 'body'):
            log.error(f"Body: {e.body}")

        return False
