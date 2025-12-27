# Runbook: Development and Deployment

## Prerequisites

- Docker / Docker Compose (V2)
- WSL2 (if on Windows)

## Local Setup

1. **Clone the repository** (if not already done).
2. **Start the services**:
   ```bash
   docker compose up --build
   ```
3. **Access the Demo**:
   Open [http://localhost:8080](http://localhost:8080) in your browser.

## Service Ports (Internal Only)

The only port exposed to the host is **8080** (Caddy).

- `edge`: 8080 (Caddy)
- `api`: 8000 (FastAPI - Internal)
- `web`: 3000 (Next.js - Internal)
- `db`: 5432 (Postgres - Internal)

## Manual Test Plan

### 1. Polling Verification
- Select "Polling" mode.
- Set interval to 5 seconds.
- Connect.
- Click "Send Test" several times.
- Verify notifications appear after 5s delay.

### 2. SSE Verification
- Select "SSE" mode.
- Connect.
- Click "Send Test".
- Verify notifications appear immediately.

### 3. WebSocket Verification
- Select "WS" mode.
- Connect.
- Click "Send Test".
- Verify notifications appear immediately.

### 4. Catch-up Verification
- Connect in any mode.
- Disconnect.
- From another tab or via `curl`, send notifications:
  ```bash
  curl -X POST http://localhost:8080/api/notifications \
    -H "Content-Type: application/json" \
    -d '{"type": "demo", "payload": {"msg": "Off-line event"}}'
  ```
- Reconnect the client.
- Verify that missed notifications are fetched during the "handshake" phase.

## Troubleshooting

- **CORS Errors**: Should not happen as everything is same-origin via 8080. Check Caddy logs if issues occur.
- **DB Connection**: Ensure the `db` service is healthy before the `api` starts.
- **Reset State**: Click "Reset All" in the UI to clear `localStorage` and local history.
