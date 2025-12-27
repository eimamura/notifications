# Notification Delivery Demo MVP

A comparison demo for delivering notifications via Polling, Server-Sent Events (SSE), and WebSockets.

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js (TypeScript/React)
- **Database**: PostgreSQL (with monotonic sequence for `seq`)
- **Proxy**: Caddy (Same-origin routing)

## Features

- **Multi-mode delivery**: Toggle between Polling, SSE, and WebSocket.
- **Catch-up functionality**: Automatically resume missed notifications after reconnection using a sequence cursor (`last_seq`).
- **Single Origin**: All traffic routed through `localhost:8080` via Caddy.

## API Specification

### HTTP
- `POST /api/notifications`: Create a test notification.
- `GET /api/notifications?after_seq=<n>`: Polling endpoint for delta fetch.
- `GET /api/notifications/stream?last_event_id=<n>`: SSE streaming endpoint.

### WebSocket
- `WS /ws`: Bi-directional channel. Requires a `hello` message with `last_seq` for initialization.

## Getting Started

Refer to [RUNBOOK.md](./RUNBOOK.md) for setup and execution instructions.
