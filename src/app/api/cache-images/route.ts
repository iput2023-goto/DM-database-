import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isImageCached, downloadImageToCache } from '@/lib/imageCache';

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(`
        SELECT DISTINCT c.id, c.image, c.faces_json
        FROM inventory i
        JOIN cards c ON i.card_id = c.id
      `)
      .all() as { id: string; image: string | null; faces_json: string | null }[];

    const urls = new Set<string>();
    for (const r of rows) {
      if (r.image) urls.add(r.image);
      if (r.faces_json) {
        try {
          const faces = JSON.parse(r.faces_json);
          if (Array.isArray(faces)) {
            for (const f of faces) {
              if (f && f.image) urls.add(f.image);
            }
          }
        } catch {}
      }
    }

    let cachedCount = 0;
    for (const u of urls) {
      if (isImageCached(u)) cachedCount++;
    }

    return NextResponse.json({
      totalImages: urls.size,
      cachedImages: cachedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = getDb();
    const rows = db
      .prepare(`
        SELECT DISTINCT c.id, c.image, c.faces_json
        FROM inventory i
        JOIN cards c ON i.card_id = c.id
      `)
      .all() as { id: string; image: string | null; faces_json: string | null }[];

    const urls = new Set<string>();
    for (const r of rows) {
      if (r.image) urls.add(r.image);
      if (r.faces_json) {
        try {
          const faces = JSON.parse(r.faces_json);
          if (Array.isArray(faces)) {
            for (const f of faces) {
              if (f && f.image) urls.add(f.image);
            }
          }
        } catch {}
      }
    }

    let cachedCount = 0;
    for (const u of urls) {
      const ok = await downloadImageToCache(u);
      if (ok) cachedCount++;
    }

    return NextResponse.json({
      success: true,
      totalImages: urls.size,
      cachedImages: cachedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

