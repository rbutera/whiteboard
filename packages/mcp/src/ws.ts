import type { Server } from "node:http";
import type { BoardService } from "@wboard/server";
import { WebSocketServer } from "ws";

export interface WebSocketPushOptions {
  /** Listen on this port (ws owns the created http server, closed by `close()`). */
  port?: number;
  /** Attach to an existing http server instead (the caller owns its lifecycle). */
  server?: Server;
  /** Per-connection poll interval in ms. Default 250. */
  pollMs?: number;
}

export interface WebSocketPushHandle {
  /** The bound port (only meaningful when `port`/`0` was used, not `server`). */
  readonly port: number | undefined;
  /** Tear everything down: stop every poller, drop every socket, close the
   * ws server (and, when ws owns it, the underlying http server). */
  close(): Promise<void>;
}

/**
 * A live-update WebSocket channel over `getEvents`, and nothing more. A client
 * connects with `board_id` (required) and `cursor` (optional, default 0) as URL
 * query params; the channel streams each event `{seq, actor, op}` as its own
 * JSON frame — the backlog after `cursor` first, then new events as they append.
 *
 * Implementation is a **thin per-connection poller**: the per-connection cursor
 * is transport state, not facade board state, and no observer hook is added to
 * `@wboard/server` — the poller keeps this channel exactly as stateless as the
 * `get_events` polling it wraps, which remains the default live-update path
 * (#453). Unknown `board_id` sends one JSON error frame and closes.
 *
 * ponytail: poll-backed push (250ms). Add a service-level append hook only if
 * poll latency ever measurably matters.
 */
export function attachWebSocketPush(
  service: BoardService,
  options: WebSocketPushOptions,
): WebSocketPushHandle {
  const pollMs = options.pollMs ?? 250;
  const wss = options.server
    ? new WebSocketServer({ server: options.server })
    : new WebSocketServer({ port: options.port });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const boardId = url.searchParams.get("board_id");
    if (!boardId) {
      ws.send(JSON.stringify({ error: "missing board_id" }));
      ws.close();
      return;
    }
    const parsedCursor = Number(url.searchParams.get("cursor"));
    let cursor = Number.isFinite(parsedCursor) ? parsedCursor : 0;

    let closed = false;
    let polling = false;

    const stop = () => {
      closed = true;
      clearInterval(timer);
    };

    const tick = async () => {
      if (closed || polling || ws.readyState !== ws.OPEN) return;
      polling = true;
      try {
        const { events } = await service.getEvents(boardId, cursor);
        for (const ev of events) {
          if (closed || ws.readyState !== ws.OPEN) break;
          ws.send(JSON.stringify(ev));
          cursor = ev.seq;
        }
      } catch (err) {
        stop();
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          ws.close();
        }
      } finally {
        polling = false;
      }
    };

    const timer = setInterval(() => void tick(), pollMs);
    ws.on("close", stop);
    void tick(); // deliver the backlog immediately, before the first interval
  });

  return {
    get port() {
      const addr = wss.address();
      return typeof addr === "object" && addr ? addr.port : undefined;
    },
    close() {
      for (const ws of wss.clients) ws.terminate();
      return new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
