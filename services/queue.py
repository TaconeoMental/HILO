from redis import Redis
from rq import Queue

from config import Config


def get_redis():
    return Redis.from_url(Config.REDIS_URL)


def get_queue(name=None):
    queue_name = name or Config.RQ_QUEUE_NAME
    return Queue(name=queue_name, connection=get_redis())
