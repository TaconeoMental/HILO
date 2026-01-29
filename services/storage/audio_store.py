import os
import tempfile

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config import Config
from logger import get_logger


log = get_logger("audio_storage")


class AudioStorageError(Exception):
    pass


class BaseAudioStorage:
    name = "base"

    def save_chunk(self, project_id, seq, data):
        raise NotImplementedError

    def ensure_local_file(self, project_id, chunk_meta):
        raise NotImplementedError

    def cleanup_local_file(self, path):
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except OSError:
            pass


class DiskAudioStorage(BaseAudioStorage):
    name = "disk"

    def save_chunk(self, project_id, seq, data):
        project_dir = os.path.join(Config.DATA_DIR, "projects", project_id)
        chunk_dir = os.path.join(project_dir, "audio_raw")
        os.makedirs(chunk_dir, exist_ok=True)
        chunk_path = os.path.join(chunk_dir, f"chunk_{seq:06d}.webm")
        with open(chunk_path, "wb") as fh:
            fh.write(data)
        relative_path = os.path.relpath(chunk_path, project_dir)
        return {
            "storage": self.name,
            "path": relative_path
        }

    def ensure_local_file(self, project_id, chunk_meta):
        project_dir = os.path.join(Config.DATA_DIR, "projects", project_id)
        chunk_path = os.path.join(project_dir, chunk_meta["path"])
        if not os.path.exists(chunk_path):
            raise AudioStorageError(f"Chunk no encontrado: {chunk_path}")
        return chunk_path, False


class S3AudioStorage(BaseAudioStorage):
    name = "s3"

    def __init__(self):
        if not Config.S3_AUDIO_BUCKET:
            raise AudioStorageError("S3_AUDIO_BUCKET requerido para backend S3")
        self._bucket = Config.S3_AUDIO_BUCKET
        self._prefix = Config.S3_AUDIO_PREFIX.strip('/')
        self._client = boto3.client("s3")

    def _object_key(self, project_id, seq):
        base = f"{self._prefix}/{project_id}" if self._prefix else project_id
        return f"{base}/chunk_{seq:06d}.webm"

    def save_chunk(self, project_id, seq, data):
        key = self._object_key(project_id, seq)
        try:
            self._client.put_object(Bucket=self._bucket, Key=key, Body=data)
        except (BotoCoreError, ClientError) as exc:
            raise AudioStorageError(f"Error subiendo chunk a S3: {exc}") from exc
        return {
            "storage": self.name,
            "path": key
        }

    def ensure_local_file(self, project_id, chunk_meta):
        key = chunk_meta["path"]
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
        tmp.close()
        try:
            self._client.download_file(self._bucket, key, tmp.name)
        except (BotoCoreError, ClientError) as exc:
            os.unlink(tmp.name)
            raise AudioStorageError(f"Error descargando chunk S3: {exc}") from exc
        return tmp.name, True


_storage_instance = None


def get_audio_storage():
    global _storage_instance
    if _storage_instance is not None:
        return _storage_instance

    backend = (Config.AUDIO_STORAGE_BACKEND or "disk").lower()
    if backend == "s3":
        _storage_instance = S3AudioStorage()
    else:
        _storage_instance = DiskAudioStorage()

    log.info("Audio storage backend: %s", _storage_instance.name)
    return _storage_instance
