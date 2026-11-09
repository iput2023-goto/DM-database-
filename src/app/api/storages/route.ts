import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const storages = db.prepare(`
      SELECT 
        s.id, 
        s.name, 
        s.color, 
        s.memo, 
        s.created_at,
        COALESCE(SUM(i.count), 0) AS total_cards,
        COUNT(i.id) AS unique_cards
      FROM storages s
      LEFT JOIN inventory i ON s.id = i.storage_id
      GROUP BY s.id
      ORDER BY s.id ASC
    `).all();

    return NextResponse.json({ storages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, color, memo } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'ストレージ名を入力してください' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO storages (name, color, memo)
      VALUES (?, ?, ?)
    `).run(name.trim(), color || '#3b82f6', memo?.trim() || '');

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

