import time
import threading
from typing import Any

_store: dict[tuple, tuple[float, Any]] = {}
_lock = threading.Lock()
TTL = 300  # 5 minutes


def get_cached(user_id: str, key: str) -> Any | None:
    cache_key = (user_id, key)
    with _lock:
        entry = _store.get(cache_key)
        if entry and (time.monotonic() - entry[0]) < TTL:
            return entry[1]
        if entry:
            del _store[cache_key]
    return None


def set_cached(user_id: str, key: str, value: Any) -> None:
    cache_key = (user_id, key)
    with _lock:
        _store[cache_key] = (time.monotonic(), value)


def invalidate_user(user_id: str) -> None:
    """Call this whenever the user's holdings change."""
    with _lock:
        keys = [k for k in _store if k[0] == user_id]
        for k in keys:
            del _store[k]
