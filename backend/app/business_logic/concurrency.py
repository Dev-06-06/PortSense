import asyncio
from collections.abc import Callable, Sequence
from typing import Any, TypeVar


T = TypeVar("T")
R = TypeVar("R")


async def gather_in_threads_bounded(
    items: Sequence[T],
    worker: Callable[[T], R],
    limit: int = 5,
) -> list[R]:
    if not items:
        return []

    concurrency = max(1, int(limit))
    semaphore = asyncio.Semaphore(concurrency)

    async def _run(item: T) -> R:
        async with semaphore:
            return await asyncio.to_thread(worker, item)

    return await asyncio.gather(*[_run(item) for item in items])
