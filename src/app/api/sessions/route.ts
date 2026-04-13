import { NextResponse } from 'next/server';
import { getSessions, getChatHistory, upsertSession } from '@/memory/index';
import { isRunning } from '@/lib/session-run-store';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (sessionId) {
    const history = await getChatHistory(sessionId);
    return NextResponse.json({ history, running: isRunning(sessionId) });
  } else {
    const sessions = await getSessions();
    const enriched = sessions.map(s => ({ ...s, running: isRunning(s.id) }));
    return NextResponse.json({ sessions: enriched });
  }
}

export async function POST(req: Request) {
  try {
    const { id, title } = await req.json();
    await upsertSession(id, title);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
