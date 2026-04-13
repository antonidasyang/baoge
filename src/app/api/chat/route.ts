import { runBaoge } from '@/agent';
import { pushDebugEvent } from '@/lib/debug-store';
import { saveMessage, saveToMemory } from '@/memory/index';
import { registerAbort, removeAbort } from '@/lib/abort-store';
import { startRun, isRunning, getRun, pushEvent, finishRun } from '@/lib/session-run-store';

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

  // 防止同一会话重复运行
  if (isRunning(sessionId)) {
    const run = getRun(sessionId)!;
    return Response.json(
      { error: 'session_already_running', requestId: run.requestId },
      { status: 409 }
    );
  }

  const rid = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const abortCtrl = registerAbort(rid);

  try {
    startRun(sessionId, rid);
  } catch {
    return Response.json({ error: 'session_already_running' }, { status: 409 });
  }

  // 推送 requestId 事件到缓冲
  pushEvent(sessionId, { type: 'request_id', requestId: rid });

  // 在后台运行 agent，不阻塞 HTTP 响应
  (async () => {
    try {
      pushDebugEvent('request_start', sessionId, { prompt: prompt.slice(0, 200) });
      await runBaoge(prompt, sessionId, (event) => {
        pushDebugEvent(event.type, sessionId, event);
        const agentName = event.agentName || 'main';
        if (event.type === 'skills_loaded') {
          pushEvent(sessionId, { type: 'skills_loaded', skillMd: event.skillMd, tools: event.tools });
        } else if (event.type === 'tool_execution_start') {
          pushEvent(sessionId, { type: 'tool_start', agentName, toolName: event.toolName, args: event.args });
        } else if (event.type === 'tool_execution_end') {
          const result = event.result;
          let text = result?.content?.[0]?.text ?? result?.details;
          if (text == null) text = typeof result === 'string' ? result : JSON.stringify(result ?? {});
          pushEvent(sessionId, { type: 'tool_end', agentName, toolName: event.toolName, result: String(text).slice(0, 500) });
        } else if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          pushEvent(sessionId, { type: 'text_delta', agentName, delta: event.assistantMessageEvent.delta });
        } else if (event.type === 'message_end' && event.message?.role === 'assistant') {
          const content = event.message.content;
          const text = Array.isArray(content) ? content.find((c: any) => c.type === 'text')?.text : '';
          if (text) {
            pushEvent(sessionId, { type: 'message_end', text });
          }
        } else if (event.type === 'max_rounds_reached') {
          pushEvent(sessionId, { type: 'max_rounds_reached', maxRounds: event.maxRounds });
        }
      }, abortCtrl.signal);

      pushDebugEvent('request_done', sessionId);
      pushEvent(sessionId, { type: 'done' });
      finishRun(sessionId, 'done');
    } catch (error: any) {
      const aborted = error?.message?.includes('abort') || abortCtrl.signal.aborted;
      pushDebugEvent(aborted ? 'request_aborted' : 'request_error', sessionId, { message: error?.message });
      pushEvent(sessionId, {
        type: aborted ? 'aborted' : 'error',
        message: aborted ? '用户已停止' : (error?.message || '未知错误'),
      });
      finishRun(sessionId, aborted ? 'aborted' : 'error');
    } finally {
      removeAbort(rid);
    }
  })();

  return Response.json({ requestId: rid });
}
