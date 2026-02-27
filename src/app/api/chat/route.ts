import { runBaoge } from '@/tools/core';
import { pushDebugEvent } from '@/lib/debug-store';
import { saveMessage, saveToMemory } from '@/memory/index';
import { registerAbort, removeAbort } from '@/lib/abort-store';

function streamEvent(controller: ReadableStreamDefaultController, event: object) {
  controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
}

export async function POST(req: Request) {
  const { prompt, sessionId, skipReply, requestId } = await req.json();
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing Session ID' }), { status: 400 });
  }

  if (skipReply) {
    await saveMessage(sessionId, 'system', prompt);
    await saveToMemory(prompt, { source: 'system_injection', sessionId });
    return Response.json({ success: true });
  }

  const rid = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const abortCtrl = registerAbort(rid);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        pushDebugEvent('request_start', sessionId, { prompt: prompt.slice(0, 200) });
        streamEvent(controller, { type: 'request_id', requestId: rid });
        await runBaoge(prompt, sessionId, (event) => {
          pushDebugEvent(event.type, sessionId, event);
          if (event.type === 'tool_execution_start') {
            streamEvent(controller, {
              type: 'tool_start',
              toolName: event.toolName,
              args: event.args,
            });
          } else if (event.type === 'tool_execution_end') {
            const result = event.result;
            let text = result?.content?.[0]?.text ?? result?.details;
            if (text == null) text = typeof result === 'string' ? result : JSON.stringify(result ?? {});
            streamEvent(controller, {
              type: 'tool_end',
              toolName: event.toolName,
              result: String(text).slice(0, 500),
            });
          } else if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
            streamEvent(controller, {
              type: 'text_delta',
              delta: event.assistantMessageEvent.delta,
            });
          } else if (event.type === 'message_end' && event.message?.role === 'assistant') {
            const content = event.message.content;
            const text = Array.isArray(content) ? content.find((c: any) => c.type === 'text')?.text : '';
            if (text) {
              streamEvent(controller, { type: 'message_end', text });
            }
          }
        }, abortCtrl.signal);

        pushDebugEvent('request_done', sessionId);
        streamEvent(controller, { type: 'done' });
      } catch (error: any) {
        const aborted = error?.message?.includes('abort') || abortCtrl.signal.aborted;
        pushDebugEvent(aborted ? 'request_aborted' : 'request_error', sessionId, { message: error?.message });
        streamEvent(controller, { type: aborted ? 'aborted' : 'error', message: aborted ? '用户已停止' : (error?.message || '未知错误') });
      } finally {
        removeAbort(rid);
        controller.close();
      }
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
