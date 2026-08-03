// Client graphql-transport-ws TỐI GIẢN (không thêm npm dep) — chỉ phục vụ subscription live-update.
// Protocol: connection_init -> connection_ack -> subscribe -> next... ; trả lời ping bằng pong.
// Dùng WebSocket gốc của browser tới /graphql (same-origin; dev đi qua Vite proxy ws:true).

type Cleanup = () => void;

/**
 * Lắng nghe tín hiệu "có thông báo mới" của 1 user qua GraphQL subscription.
 * onSignal chỉ nhận 1 chuỗi loại sự kiện (checkin/session) — KHÔNG mang data;
 * caller tự refetch query đã auth. Tự reconnect khi rớt.
 */
export function subscribeNotify(userId: string, onSignal: (kind: string) => void): Cleanup {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    try {
      ws = new WebSocket(`${proto}://${location.host}/graphql`, "graphql-transport-ws");
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => ws?.send(JSON.stringify({ type: "connection_init" }));

    ws.onmessage = (ev) => {
      let m: { type?: string; id?: string; payload?: { data?: { onNotify?: string } } };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "connection_ack") {
        retry = 0;
        ws?.send(JSON.stringify({
          id: "notify",
          type: "subscribe",
          payload: { query: "subscription($u:String!){ onNotify(userId:$u) }", variables: { u: userId } },
        }));
      } else if (m.type === "next" && m.id === "notify") {
        const kind = m.payload?.data?.onNotify;
        if (kind) onSignal(String(kind));
      } else if (m.type === "ping") {
        ws?.send(JSON.stringify({ type: "pong" }));
      }
    };

    ws.onclose = () => scheduleReconnect();
    ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    retry = Math.min(retry + 1, 6);
    timer = setTimeout(connect, 1000 * retry); // backoff, tối đa ~6s
  };

  connect();
  return () => { closed = true; if (timer) clearTimeout(timer); try { ws?.close(); } catch { /* noop */ } };
}
