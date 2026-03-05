import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, Tuple

from fastapi import HTTPException


@dataclass
class Limit:
    max_requests: int
    window_seconds: int


class InMemoryRateLimiter:
    def __init__(self):
        self._store: Dict[str, Deque[float]] = {}

    def check(self, key: str, limit: Limit):
        now = time.time()

        q = self._store.get(key)
        if q is None:
            q = deque()
            self._store[key] = q

        cutoff = now - limit.window_seconds
        while q and q[0] < cutoff:
            q.popleft()

        if len(q) >= limit.max_requests:
            retry_after = int(q[0] + limit.window_seconds - now) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after}s",
                headers={"Retry-After": str(retry_after)},
            )

        q.append(now)


limiter = InMemoryRateLimiter()


def limit_for_role(role: str) -> Tuple[int, int]:
    # (max_requests, window_seconds)
    if role == "admin":
        return (300, 60)  # 300 req / minute
    return (60, 60)       # 60 req / minute