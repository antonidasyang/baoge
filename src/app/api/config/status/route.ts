import { NextResponse } from 'next/server';
import { isConfigured, CONFIG_FILE_PATH } from '@/config';

export async function GET() {
  return NextResponse.json({
    configured: isConfigured(),
    configPath: CONFIG_FILE_PATH,
  });
}
