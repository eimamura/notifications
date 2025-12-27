"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Notification = {
  id: string;
  seq: number;
  type: string;
  payload: any;
  created_at: string;
};

type Mode = "poll" | "sse" | "ws";

export default function NotificationDemo() {
  // State
  const [mode, setMode] = useState<Mode>("poll");
  const [connected, setConnected] = useState(false);
  const [pollIntervalSec, setPollIntervalSec] = useState(10);
  const [lastSeq, setLastSeq] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // Refs for cleanup
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem("demo_last_seq");
    if (saved) {
      setLastSeq(parseInt(saved, 10));
    }
  }, []);

  useEffect(() => {
    if (lastSeq > 0) {
      localStorage.setItem("demo_last_seq", lastSeq.toString());
    }
  }, [lastSeq]);

  const addLog = (msg: string) => {
    setLogs((prev) => [msg, ...prev].slice(0, 5));
  };

  const handleNotification = useCallback((notif: Notification) => {
    setItems((prev) => {
      // Prevent duplicates if any
      if (prev.some((item) => item.seq === notif.seq)) return prev;
      const updated = [notif, ...prev].slice(0, 100);
      return updated.sort((a, b) => b.seq - a.seq);
    });
    setLastSeq((prev) => Math.max(prev, notif.seq));
  }, []);

  // --- Handlers ---

  const stopAll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    addLog("Disconnected");
  }, []);

  const startPolling = useCallback(async () => {
    const fetchDelta = async () => {
      try {
        const currentLastSeq = parseInt(localStorage.getItem("demo_last_seq") || "0", 10);
        const res = await fetch(`/api/notifications?after_seq=${currentLastSeq}&limit=50`);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
          data.items.forEach(handleNotification);
          addLog(`Polled ${data.items.length} new items`);
        }
      } catch (err) {
        addLog("Polling error");
      }

      if (connected) {
        pollTimerRef.current = setTimeout(fetchDelta, pollIntervalSec * 1000);
      }
    };

    setConnected(true);
    addLog(`Started Polling (interval: ${pollIntervalSec}s)`);
    fetchDelta();
  }, [connected, pollIntervalSec, handleNotification]);

  const startSSE = useCallback(() => {
    const currentLastSeq = parseInt(localStorage.getItem("demo_last_seq") || "0", 10);
    const url = `/api/notifications/stream?last_event_id=${currentLastSeq}`;

    const es = new EventSource(url);
    sseRef.current = es;
    setConnected(true);
    addLog("SSE Connecting...");

    es.addEventListener("notification", (e) => {
      const notif = JSON.parse(e.data);
      handleNotification(notif);
    });

    es.onopen = () => addLog("SSE Connected");
    es.onerror = () => {
      addLog("SSE Error/Closed");
      stopAll();
    };
  }, [handleNotification, stopAll]);

  const startWS = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    setConnected(true);
    addLog("WebSocket Connecting...");

    ws.onopen = () => {
      addLog("WebSocket Connected");
      const currentLastSeq = parseInt(localStorage.getItem("demo_last_seq") || "0", 10);
      ws.send(JSON.stringify({ type: "hello", last_seq: currentLastSeq }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "notification") {
        handleNotification(msg.data);
      }
    };

    ws.onclose = () => {
      addLog("WebSocket Closed");
      setConnected(false);
    };

    ws.onerror = () => addLog("WebSocket Error");
  }, [handleNotification]);

  const handleConnect = () => {
    stopAll();
    if (mode === "poll") startPolling();
    else if (mode === "sse") startSSE();
    else if (mode === "ws") startWS();
  };

  const sendTestNotification = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "demo",
          payload: { msg: "Hello from UI!", timestamp: new Date().toISOString() }
        })
      });
      const data = await res.json();
      addLog(`Created notification seq=${data.seq}`);
    } catch (err) {
      addLog("Failed to send notification");
    }
  };

  return (
    <main>
      <div className="glow-bg" />

      <h1>Notification Delivery Demo</h1>

      <div className="panel">
        <div className="controls">
          <div className="control-group">
            <label>Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              disabled={connected}
            >
              <option value="poll">Polling</option>
              <option value="sse">SSE (Push)</option>
              <option value="ws">WebSocket (Bi-di)</option>
            </select>
          </div>

          {mode === "poll" && (
            <div className="control-group">
              <label>Interval (sec)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={pollIntervalSec}
                onChange={(e) => setPollIntervalSec(parseInt(e.target.value))}
                disabled={connected}
              />
            </div>
          )}

          <div className="control-group">
            <label>&nbsp;</label>
            {!connected ? (
              <button className="btn-primary" onClick={handleConnect}>Connect</button>
            ) : (
              <button className="btn-danger" onClick={stopAll}>Disconnect</button>
            )}
          </div>

          <div className="control-group">
            <label>&nbsp;</label>
            <button className="btn-secondary" onClick={sendTestNotification}>
              Send Test
            </button>
          </div>

          <div className="control-group" style={{ marginLeft: 'auto' }}>
            <label>Status</label>
            <span className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem' }}>Notifications</h2>
            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Last Seq: <strong>{lastSeq}</strong></span>
          </div>
          <div className="notification-list">
            {items.map((item) => (
              <div key={item.id} className="notification-item">
                <div>
                  <span className="notification-seq">#{item.seq}</span>
                  <span className="notification-type">{item.type}</span>
                  <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
                    {item.payload.msg}
                  </div>
                </div>
                <div className="notification-time">
                  {new Date(item.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                No notifications received yet.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem' }}>Activity Log</h2>
            <button
              className="btn-secondary"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => { setItems([]); setLastSeq(0); localStorage.removeItem("demo_last_seq"); }}
            >
              Reset All
            </button>
          </div>
          <div className="notification-list">
            {logs.map((log, i) => (
              <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.875rem', color: '#cbd5e1' }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
