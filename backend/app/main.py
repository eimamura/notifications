from fastapi import FastAPI, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import asyncio
import json
import logging
from typing import Optional, List

from .database import get_db, engine, Base
from .models import Notification
from .broadcaster import broadcaster

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize DB tables (for demo simplicity, avoiding separate migration step initially)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Notification Delivery Demo")

@app.post("/api/notifications", status_code=201)
async def create_notification(data: dict, db: Session = Depends(get_db)):
    """
    Create a notification and broadcast it to live subscribers.
    """
    if "type" not in data or "payload" not in data:
        raise HTTPException(status_code=400, detail="Missing type or payload")
    
    # Insert with sequence
    # Note: SQLAlchemy handles the sequence if defined in the model
    notification = Notification(
        type=data["type"],
        payload=data["payload"]
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    
    result = notification.to_dict()
    
    # Broadcast to live subscribers
    await broadcaster.broadcast(result)
    
    logger.info(f"Notification created: seq={notification.seq}")
    return result

@app.get("/api/notifications")
async def poll_notifications(
    after_seq: int = Query(0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db)
):
    """
    Polling endpoint: fetch notifications after a certain sequence.
    """
    items = db.query(Notification)\
        .filter(Notification.seq > after_seq)\
        .order_by(Notification.seq.asc())\
        .limit(limit)\
        .all()
    
    results = [item.to_dict() for item in items]
    next_after_seq = results[-1]["seq"] if results else after_seq
    
    return {
        "items": results,
        "next_after_seq": next_after_seq
    }

@app.get("/api/notifications/stream")
async def sse_notifications(
    request: Request,
    last_event_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    SSE endpoint: streams notifications with catch-up functionality.
    """
    async def event_generator():
        # 1. Catch-up from backlog
        cursor = last_event_id or 0
        backlog = db.query(Notification)\
            .filter(Notification.seq > cursor)\
            .order_by(Notification.seq.asc())\
            .limit(200)\
            .all()
        
        for item in backlog:
            yield f"id: {item.seq}\nevent: notification\ndata: {json.dumps(item.to_dict())}\n\n"
            cursor = item.seq

        # 2. Subscribe to live updates
        queue = await broadcaster.subscribe()
        try:
            while True:
                # Check for disconnection
                if await request.is_disconnected():
                    break
                
                try:
                    # Wait for next message or timeout for keep-alive
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"id: {msg['seq']}\nevent: notification\ndata: {json.dumps(msg)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    """
    WebSocket endpoint: bidirectional channel with catch-up.
    """
    await websocket.accept()
    queue = await broadcaster.subscribe()
    
    try:
        # 1. Wait for 'hello' message for catch-up
        try:
            hello_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
            if hello_msg.get("type") != "hello":
                await websocket.close(code=1008)
                return
            
            last_seq = hello_msg.get("last_seq", 0)
            logger.info(f"WS hello received: last_seq={last_seq}")
            
            # 2. Fetch backlog
            backlog = db.query(Notification)\
                .filter(Notification.seq > last_seq)\
                .order_by(Notification.seq.asc())\
                .limit(200)\
                .all()
            
            for item in backlog:
                await websocket.send_json({
                    "type": "notification",
                    "data": item.to_dict()
                })
        except (asyncio.TimeoutError, json.JSONDecodeError, KeyError):
            await websocket.close(code=1008)
            return

        # 3. Live stream loop
        # We need a task to handle incoming messages (even if we ignore them)
        # and another to push from the queue.
        async def push_updates():
            while True:
                msg = await queue.get()
                await websocket.send_json({
                    "type": "notification",
                    "data": msg
                })

        push_task = asyncio.create_task(push_updates())
        
        try:
            # Keep the connection open and listen for close
            while True:
                await websocket.receive_text() # Just wait for close or ignore other messages
        except WebSocketDisconnect:
            push_task.cancel()
            logger.info("WebSocket disconnected")
            
    finally:
        broadcaster.unsubscribe(queue)
