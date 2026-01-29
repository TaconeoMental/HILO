import os
import json
import threading

from config import Config

_lock = threading.Lock()


def get_timeline_path(project_id):
    return os.path.join(Config.DATA_DIR, "projects", project_id, "timeline.json")


def load_timeline(project_id):
    path = get_timeline_path(project_id)
    if not os.path.exists(path):
        return {"photos": []}
    with _lock:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


def save_timeline(project_id, timeline):
    path = get_timeline_path(project_id)
    with _lock:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(timeline, f, indent=2, ensure_ascii=False)


def add_photo(project_id, photo_id, t_ms, original_path, stylized_path=None):
    timeline = load_timeline(project_id)

    photo_entry = {
        "photo_id": photo_id,
        "t_ms": t_ms,
        "original_path": original_path,
        "stylized_path": stylized_path
    }

    timeline["photos"].append(photo_entry)
    timeline["photos"].sort(
        key=lambda x: x.get("t_ms", 0)
    )

    save_timeline(project_id, timeline)
    return photo_entry


def update_photo_stylized(project_id, photo_id, stylized_path):
    timeline = load_timeline(project_id)

    for photo in timeline["photos"]:
        if photo["photo_id"] == photo_id:
            photo["stylized_path"] = stylized_path
            break

    save_timeline(project_id, timeline)


def get_photos(project_id):
    timeline = load_timeline(project_id)
    return timeline.get("photos", [])
