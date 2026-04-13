/**
 * 会话运行状态管理 —— 将 agent 执行与 HTTP 连接解耦
 *
 * 每个 sessionId 至多一个活跃运行。事件缓冲在内存中，
 * 支持多个 SSE 客户端订阅（含历史回放），断线重连后可恢复。
 */

export interface SessionRun {
  sessionId: string;
  requestId: string;
  status: 'running' | 'done' | 'error' | 'aborted';
  events: object[];
  listeners: Set<(event: object) => void>;
  startedAt: number;
  finishedAt?: number;
}

const runs = new Map<string, SessionRun>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const BUFFER_TTL_MS = 5 * 60 * 1000; // 结束后保留 5 分钟

export function startRun(sessionId: string, requestId: string): SessionRun {
  const existing = runs.get(sessionId);
  if (existing && existing.status === 'running') {
    throw new Error('session_already_running');
  }
  // 清除旧的清理定时器
  const timer = cleanupTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(sessionId);
  }
  const run: SessionRun = {
    sessionId,
    requestId,
    status: 'running',
    events: [],
    listeners: new Set(),
    startedAt: Date.now(),
  };
  runs.set(sessionId, run);
  return run;
}

export function getRun(sessionId: string): SessionRun | undefined {
  return runs.get(sessionId);
}

export function isRunning(sessionId: string): boolean {
  const run = runs.get(sessionId);
  return run?.status === 'running';
}

export function pushEvent(sessionId: string, event: object): void {
  const run = runs.get(sessionId);
  if (!run) return;
  run.events.push(event);
  for (const cb of run.listeners) {
    try { cb(event); } catch {}
  }
}

/**
 * 订阅会话事件流。先回放所有已缓冲的事件，再监听后续实时事件。
 * 返回取消订阅函数。
 */
export function subscribe(sessionId: string, cb: (event: object) => void): () => void {
  const run = runs.get(sessionId);
  if (!run) return () => {};

  // 回放历史
  for (const ev of run.events) {
    try { cb(ev); } catch {}
  }

  // 如果已结束，无需再监听
  if (run.status !== 'running') {
    return () => {};
  }

  run.listeners.add(cb);
  return () => { run.listeners.delete(cb); };
}

export function finishRun(sessionId: string, status: 'done' | 'error' | 'aborted'): void {
  const run = runs.get(sessionId);
  if (!run) return;
  run.status = status;
  run.finishedAt = Date.now();
  run.listeners.clear();

  // 5 分钟后清理缓冲
  const timer = setTimeout(() => {
    runs.delete(sessionId);
    cleanupTimers.delete(sessionId);
  }, BUFFER_TTL_MS);
  cleanupTimers.set(sessionId, timer);
}

export function getRunningSessionIds(): string[] {
  const ids: string[] = [];
  for (const [id, run] of runs) {
    if (run.status === 'running') ids.push(id);
  }
  return ids;
}
