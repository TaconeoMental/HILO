from rq import Retry

from config import Config
from logger import get_logger
from services import project_store
from services.queue import get_queue


log = get_logger("orchestrator")


def enqueue_processing_pipeline(project_id):
    from services.jobs import audio_prepare

    queue = get_queue(Config.RQ_AUDIO_QUEUE)
    retry = Retry(max=3, interval=[10, 60, 180])
    job = queue.enqueue(
        audio_prepare.prepare_project_job,
        project_id,
        job_timeout=Config.AUDIO_PREP_JOB_TIMEOUT,
        retry=retry
    )
    project_store.update_processing_jobs(project_id, {"prepare": job.id})
    project_store.update_project_status(project_id, "queued", job_id=job.id)
    log.info("Proyecto %s en cola (prepare job %s)", project_id, job.id)
    return job
