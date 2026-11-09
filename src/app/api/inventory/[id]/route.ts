import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM inventory WHERE id = ?').run(parseInt(id, 10));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { count, storage_id, condition, memo } = body;
    const db = getDb();

    // countが0以下の場合は削除
    if (count !== undefined && count <= 0) {
      db.prepare('DELETE FROM inventory WHERE id = ?').run(parseInt(id, 10));
      return NextResponse.json({ success: true, deleted: true });
    }

    db.prepare(`
      UPDATE inventory 
      SET count = COALESCE(?, count),
          storage_id = COALESCE(?, storage_id),
          condition = COALESCE(?, condition),
          memo = COALESCE(?, memo),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(count, storage_id, condition, memo, parseInt(id, 10));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

