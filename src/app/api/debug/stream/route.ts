import { getRecentEvents, subscribeDebugEvents } from '@/lib/debug-store';

export async function GET() {
  let unsub: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      function send(ev: unknown) {
        try {
          controller.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n'));
        } catch {}
      }
      for (const ev of getRecentEvents()) {
        send(ev);
      }
      unsub = subscribeDebugEvents((ev) => send(ev));
    },
    cancel() {
      unsub?.();
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
