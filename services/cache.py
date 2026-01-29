from redis import Redis

from config import Config


_redis_client = None


def get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(Config.REDIS_URL)
    return _redis_client
