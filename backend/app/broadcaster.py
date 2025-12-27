import asyncio
from typing import List, Any
import json

class Broadcaster:
    def __init__(self):
        self._subscribers: List[asyncio.Queue] = []

    async def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    async def broadcast(self, message: Any):
        if not self._subscribers:
            return
        
        # Broadcast to all active queues
        for queue in self._subscribers:
            await queue.put(message)

# Global broadcaster instance
broadcaster = Broadcaster()
