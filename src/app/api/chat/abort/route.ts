import { abortRequest } from '@/lib/abort-store';

export async function POST(req: Request) {
  const { requestId } = await req.json();
  if (!requestId) {
    return Response.json({ error: 'Missing requestId' }, { status: 400 });
  }
  const ok = abortRequest(requestId);
  return Response.json({ success: ok });
}
