import { NextResponse } from 'next/server';
import { listSkills, installSkill, removeSkill } from '@/lib/skills';

export async function GET() {
  const skills = listSkills();
  return NextResponse.json({ skills });
}

export async function POST(req: Request) {
  try {
    const { source } = await req.json();
    if (!source || typeof source !== 'string') {
      return NextResponse.json({ error: '缺少 source 参数' }, { status: 400 });
    }
    const { name } = await installSkill(source);
    return NextResponse.json({ success: true, name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '安装失败' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 });
  }
  const ok = removeSkill(name);
  if (!ok) {
    return NextResponse.json({ error: '技能不存在' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
