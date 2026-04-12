import fs from 'fs';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'CHANGELOG.md');
  if (!fs.existsSync(filePath)) {
    return new Response('Changelog not found.', { status: 404 });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return new Response(content, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
