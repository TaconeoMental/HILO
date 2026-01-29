import json

from flask_login import current_user

from config import Config
from helpers import is_valid_uuid
from logger import get_logger
from services import project_store
from services.storage import get_audio_storage


log = get_logger("audio_ws")


class AudioStreamError(Exception):
    pass


class AudioIngestSession:
    def __init__(self, project_id, user_id):
        self.project_id = project_id
        self.user_id = user_id
        self.started = False
        self.pending_meta = None
        self.storage = get_audio_storage()
        self.last_seq = -1

    def start(self):
        if not project_store.project_exists(self.project_id):
            raise AudioStreamError("Proyecto no encontrado")
        if not project_store.user_owns_project(self.project_id, self.user_id):
            raise AudioStreamError("Acceso denegado")
        if project_store.is_project_stopped(self.project_id):
            raise AudioStreamError("El proyecto está detenido")
        self.started = True

    def set_chunk_meta(self, meta):
        if not self.started:
            raise AudioStreamError("Sesión no inicializada")
        if self.pending_meta is not None:
            raise AudioStreamError("Chunk pendiente sin datos")

        seq = meta.get("seq")
        duration_ms = meta.get("duration_ms")
        start_ms = meta.get("start_ms")
        size = meta.get("size")

        if seq is None or duration_ms is None or start_ms is None or size is None:
            raise AudioStreamError("chunk incompleto")

        try:
            seq = int(seq)
            duration_ms = int(duration_ms)
            start_ms = int(start_ms)
            size = int(size)
        except (TypeError, ValueError):
            raise AudioStreamError("chunk inválido")

        if seq <= self.last_seq:
            raise AudioStreamError("secuencia desordenada")
        if duration_ms <= 0:
            raise AudioStreamError("duration inválida")
        if start_ms < 0:
            raise AudioStreamError("start inválido")
        if size <= 0 or size > Config.MAX_CHUNK_SIZE:
            raise AudioStreamError("chunk_size inválido")
        if project_store.is_recording_limit_exceeded(self.project_id):
            raise AudioStreamError("Tiempo de grabación agotado")

        self.pending_meta = {
            "seq": seq,
            "duration_ms": duration_ms,
            "start_ms": start_ms,
            "size": size
        }

    def save_chunk_data(self, payload):
        if not self.pending_meta:
            raise AudioStreamError("chunk sin metadata")

        if len(payload) > Config.MAX_CHUNK_SIZE:
            raise AudioStreamError("chunk demasiado grande")

        if project_store.is_project_stopped(self.project_id):
            raise AudioStreamError("El proyecto está detenido")

        meta = self.pending_meta
        seq = meta["seq"]
        storage_meta = self.storage.save_chunk(self.project_id, seq, payload)

        chunk_entry = {
            "seq": seq,
            "start_ms": meta["start_ms"],
            "duration_ms": meta["duration_ms"],
            "bytes": len(payload),
            **storage_meta
        }
        project_store.append_ingest_chunk(self.project_id, chunk_entry)

        self.last_seq = seq
        self.pending_meta = None
        return chunk_entry


def _send(ws, payload):
    ws.send(json.dumps(payload))


def handle_websocket(ws):
    session = None
    try:
        while True:
            message = ws.receive()
            if message is None:
                break

            if isinstance(message, bytes):
                if not session:
                    raise AudioStreamError("Sesión no iniciada")
                chunk = session.save_chunk_data(message)
                _send(ws, {"type": "chunk_ack", "seq": chunk["seq"]})
                continue

            try:
                data = json.loads(message)
            except ValueError:
                raise AudioStreamError("Mensaje inválido")

            msg_type = data.get("type")
            if msg_type == "init":
                project_id = data.get("project_id")
                if not project_id or not is_valid_uuid(project_id):
                    raise AudioStreamError("project_id inválido")
                session = AudioIngestSession(project_id, current_user.id)
                session.start()
                _send(ws, {"type": "init_ack", "project_id": project_id})
            elif msg_type == "chunk":
                if not session:
                    raise AudioStreamError("Sesión no iniciada")
                session.set_chunk_meta(data)
                _send(ws, {"type": "chunk_ready", "seq": data.get("seq")})
            elif msg_type == "complete":
                _send(ws, {"type": "complete_ack"})
                break
            else:
                raise AudioStreamError("tipo no soportado")
    except AudioStreamError as exc:
        log.warning("Audio WS error: %s", exc)
        _send(ws, {"type": "error", "error": str(exc)})
    except Exception as exc:  # pragma: no cover
        log.error("Audio WS excepción: %s", exc)
        _send(ws, {"type": "error", "error": "Error interno"})
    finally:
        try:
            ws.close()
        except Exception:  # pragma: no cover
            pass
