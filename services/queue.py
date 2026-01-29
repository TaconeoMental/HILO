from rq import Queue

from config import Config
from services.cache import get_redis_client


def get_queue(name=None):
    queue_name = name or Config.RQ_QUEUE_NAME
    return Queue(name=queue_name, connection=get_redis_client())
