from flask_login import current_user

from config import Config
from extensions import sock
from services.audio_ingest import handle_websocket


@sock.route(Config.AUDIO_WS_PATH)
def audio_stream(ws):
    if not current_user.is_authenticated:
        ws.close()
        return
    handle_websocket(ws)
