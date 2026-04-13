import fs from 'fs';
import path from 'path';
import { resolveWorkspacePath } from '@/lib/workspace';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
};

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  if (!segments || segments.length < 2) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const sessionId = segments[0];
  const filePath = segments.slice(1).join('/');

  // 校验 sessionId 格式：允许字母、数字、下划线、连字符
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  let absPath: string;
  try {
    absPath = resolveWorkspacePath(sessionId, filePath);
  } catch {
    return Response.json({ error: 'Path not allowed' }, { status: 403 });
  }

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(absPath);
  const filename = path.basename(absPath);
  const mimeType = getMimeType(filename);

  return new Response(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
