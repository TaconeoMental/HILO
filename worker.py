import argparse
import threading

from redis import Redis
from rq import Worker

from config import Config
from logger import get_logger
from services.retention import run_cleanup_loop


log = get_logger("worker")


def parse_args():
    parser = argparse.ArgumentParser(description="RQ worker launcher")
    parser.add_argument(
        "--queues",
        help="Comma separated list of queue names to listen on",
        default=""
    )
    parser.add_argument(
        "--name",
        help="Optional worker name override",
        default=""
    )
    return parser.parse_args()


def main():
    redis_conn = Redis.from_url(Config.REDIS_URL)
    args = parse_args()
    cleanup_thread = threading.Thread(
        target=run_cleanup_loop,
        kwargs={"interval_seconds": 3600},
        daemon=True
    )
    cleanup_thread.start()
    queues = [q.strip() for q in args.queues.split(",") if q.strip()]
    if not queues:
        queues = [
            Config.RQ_AUDIO_QUEUE,
            Config.RQ_TRANSCRIBE_QUEUE,
            Config.RQ_PHOTO_QUEUE,
            Config.RQ_LLM_QUEUE
        ]
    log.info("Worker listening on queues: %s", ", ".join(queues))
    worker = Worker(queues, connection=redis_conn, name=args.name or None)
    worker.work()


if __name__ == "__main__":
    main()
