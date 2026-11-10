import { NextResponse } from 'next/server';
import { generatePortableHtml } from '@/lib/portableGenerator';

export async function GET() {
  try {
    const html = generatePortableHtml();
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="DM-Vault-Portable.html"',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

