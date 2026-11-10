import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeForSearch } from '@/lib/normalize';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storageId = searchParams.get('storageId');
    const q = searchParams.get('q')?.trim() || '';
    const civil = searchParams.get('civil')?.trim() || '';
    const cost = searchParams.get('cost');

    const db = getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (storageId && storageId !== 'all') {
      conditions.push('i.storage_id = ?');
      params.push(parseInt(storageId, 10));
    }

    if (q) {
      conditions.push('c.search_key LIKE ?');
      params.push(`%${normalizeForSearch(q)}%`);
    }

    if (civil) {
      conditions.push('c.civil LIKE ?');
      params.push(`%${civil}%`);
    }

    if (cost !== null && cost !== undefined && cost !== '') {
      conditions.push('c.cost = ?');
      params.push(parseInt(cost, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT 
        i.id,
        i.storage_id,
        s.name AS storage_name,
        s.color AS storage_color,
        i.card_id,
        c.name AS card_name,
        c.name_ruby AS card_ruby,
        c.pack AS card_pack,
        c.type AS card_type,
        c.civil AS card_civil,
        c.rarity AS card_rarity,
        c.cost AS card_cost,
        c.power AS card_power,
        c.race AS card_race,
        c.image AS card_image,
        c.alt_names AS card_alt_names,
        c.faces_json AS card_faces_json,
        i.count,
        i.condition,
        i.memo,
        i.updated_at
      FROM inventory i
      JOIN cards c ON i.card_id = c.id
      JOIN storages s ON i.storage_id = s.id
      ${whereClause}
      ORDER BY i.updated_at DESC, c.cost ASC
    `;

    const items = db.prepare(query).all(...params);
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();

    // 複数カードの一括登録 (構築済みデッキ追加など)
    if (Array.isArray(body.items)) {
      const storage_id = body.storage_id;
      if (!storage_id) {
        return NextResponse.json({ error: '保管場所を選択してください' }, { status: 400 });
      }

      const insertMany = db.transaction((itemsList: Array<{ card_id: string; count: number }>) => {
        let addedTotal = 0;
        for (const item of itemsList) {
          if (!item.card_id) continue;
          const c = item.count || 1;
          const cond = 'プレイ用';
          const existing = db.prepare(`
            SELECT id, count FROM inventory 
            WHERE storage_id = ? AND card_id = ? AND condition = ?
          `).get(storage_id, item.card_id, cond) as { id: number; count: number } | undefined;

          if (existing) {
            db.prepare(`
              UPDATE inventory 
              SET count = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(existing.count + c, existing.id);
          } else {
            db.prepare(`
              INSERT INTO inventory (storage_id, card_id, count, condition, memo)
              VALUES (?, ?, ?, ?, '')
            `).run(storage_id, item.card_id, c, cond);
          }
          addedTotal += c;
        }
        return addedTotal;
      });

      const totalCount = insertMany(body.items);
      return NextResponse.json({ success: true, count: totalCount, itemsCount: body.items.length });
    }

    const { storage_id, card_id, count = 1, condition = 'プレイ用', memo = '' } = body;

    if (!storage_id || !card_id) {
      return NextResponse.json({ error: '保管場所とカードを選択してください' }, { status: 400 });
    }

    // 同一ストレージ・同一カード・同一状態の既存エントリをチェック
    const existing = db.prepare(`
      SELECT id, count FROM inventory 
      WHERE storage_id = ? AND card_id = ? AND condition = ?
    `).get(storage_id, card_id, condition) as { id: number; count: number } | undefined;

    if (existing) {
      // 既存なら枚数を加算
      const newCount = existing.count + count;
      db.prepare(`
        UPDATE inventory 
        SET count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, existing.id);

      return NextResponse.json({ success: true, updated: true, id: existing.id, newCount });
    } else {
      // 新規レコード追加
      const result = db.prepare(`
        INSERT INTO inventory (storage_id, card_id, count, condition, memo)
        VALUES (?, ?, ?, ?, ?)
      `).run(storage_id, card_id, count, condition, memo);

      return NextResponse.json({ success: true, id: result.lastInsertRowid });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storageId = searchParams.get('storageId');
    const db = getDb();

    if (storageId && storageId !== 'all') {
      db.prepare('DELETE FROM inventory WHERE storage_id = ?').run(parseInt(storageId, 10));
    } else {
      db.prepare('DELETE FROM inventory').run();
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

