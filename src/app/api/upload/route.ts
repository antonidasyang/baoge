import { NextResponse } from 'next/server';
import { registerAsset } from '@/memory/index';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const paths = formData.getAll('paths') as string[]; // 获取原始相对路径

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = paths[i] || file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      
      const asset = await registerAsset(buffer, file.name, relativePath);
      results.push(asset);
    }

    return NextResponse.json({ success: true, assets: results });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
