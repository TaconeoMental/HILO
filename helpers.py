import os
import uuid
import base64

# Cache de prompts cargados
_prompts_cache = {}


def load_prompt(name):
    """Carga un prompt desde el directorio prompts/."""
    if name in _prompts_cache:
        return _prompts_cache[name]

    prompts_dir = os.path.join(os.path.dirname(__file__), "prompts")
    prompt_path = os.path.join(prompts_dir, f"{name}.txt")

    with open(prompt_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    _prompts_cache[name] = content
    return content


def is_valid_uuid(value):
    if not value:
        return False
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def parse_data_url(data_url):
    """
    Parsea un data URL y retorna (header, bytes) o (None, None) si el formato
    es inválido.
    """
    if not data_url or ',' not in data_url:
        return None, None

    try:
        header, encoded = data_url.split(",", 1)
        image_data = base64.b64decode(encoded)
        return header, image_data
    except Exception:
        return None, None


def get_image_extension(header):
    if header and "png" in header.lower():
        return "png"
    return "jpg"


def encode_image_base64(image_path):
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def get_mime_type(filename):
    ext = filename.lower().split('.')[-1] if '.' in filename else ''

    mime_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'md': 'text/plain; charset=utf-8',
        'txt': 'text/plain; charset=utf-8',
    }

    return mime_types.get(ext)
