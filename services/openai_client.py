from config import Config
from openai import OpenAI

_client = None

# Singleton cliente OpenAI
def get_openai_client():
    global _client
    if _client is None:
        if not Config.OPENAI_API_KEY:
            return None
        _client = OpenAI(api_key=Config.OPENAI_API_KEY)
    return _client
