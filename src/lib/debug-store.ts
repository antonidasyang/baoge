export interface DebugEvent {
  ts: number;
  type: string;
  sessionId?: string;
  payload?: unknown;
}

const MAX_EVENTS = 500;
const events: DebugEvent[] = [];
const listeners = new Set<(ev: DebugEvent) => void>();

function sanitize(ev: unknown, depth = 0): unknown {
  if (depth > 5) return '[max depth]';
  if (ev == null) return ev;
  if (typeof ev !== 'object') return ev;
  if (Array.isArray(ev)) return ev.map((v) => sanitize(v, depth + 1));
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ev)) {
    if (k === 'getApiKey' || k.startsWith('_')) continue;
    try {
      o[k] = sanitize(v, depth + 1);
    } catch {
      o[k] = '[error]';
    }
  }
  return o;
}

export function pushDebugEvent(type: string, sessionId?: string, payload?: unknown) {
  const ev: DebugEvent = { ts: Date.now(), type, sessionId, payload: sanitize(payload) };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
  listeners.forEach((fn) => fn(ev));
}

export function getRecentEvents(): DebugEvent[] {
  return [...events];
}

export function subscribeDebugEvents(cb: (ev: DebugEvent) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
