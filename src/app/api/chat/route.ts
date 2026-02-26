import { NextResponse } from 'next/server';
// 修正：指向新的扁平路径
import { runBaoge } from '../../../tools/core';

export async function POST(req: Request) {
  try {
    const { prompt, sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing Session ID");
    
    let finalReply = "";

    await runBaoge(prompt, sessionId, (event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const content = event.message.content;
        const text = Array.isArray(content) ? content.find((c: any) => c.type === 'text')?.text : "";
        if (text) finalReply = text;
      }
    });

    return NextResponse.json({ reply: finalReply || "豹哥想了想，没有给出明确回复。" });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
