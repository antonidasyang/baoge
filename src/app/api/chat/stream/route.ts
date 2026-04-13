import { getRun, subscribe } from '@/lib/session-run-store';

function streamEvent(controller: ReadableStreamDefaultController, event: object) {
  controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const run = getRun(sessionId);
  if (!run) {
    return Response.json({ status: 'no_run' }, { status: 404 });
  }

  let unsub: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      unsub = subscribe(sessionId, (event: any) => {
        try {
          streamEvent(controller, event);
          if (event.type === 'done' || event.type === 'error' || event.type === 'aborted') {
            if (unsub) unsub();
            controller.close();
          }
        } catch {
          // controller already closed
        }
      });
    },
    cancel() {
      // 客户端断开 — 只取消监听，不影响 agent 运行
      if (unsub) unsub();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
