import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

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

    const inventory = db.prepare(`
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
      ORDER BY i.updated_at DESC, c.cost ASC
    `).all();

    return NextResponse.json(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        storages,
        inventory,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { storages, inventory, mode = 'merge' } = body;

    if (!Array.isArray(storages) || !Array.isArray(inventory)) {
      return NextResponse.json(
        { error: 'バックアップデータの形式が正しくありません' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = getDb();

    db.transaction(() => {
      if (mode === 'replace') {
        db.prepare('DELETE FROM inventory').run();
        db.prepare('DELETE FROM storages').run();

        const insertStorage = db.prepare(
          'INSERT INTO storages (id, name, color, memo) VALUES (?, ?, ?, ?)'
        );
        for (const s of storages) {
          insertStorage.run(s.id, s.name || 'ストレージ', s.color || '#3b82f6', s.memo || '');
        }

        const insertInv = db.prepare(`
          INSERT INTO inventory (storage_id, card_id, count, condition, memo, updated_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `);
        for (const item of inventory) {
          if (!item.card_id || item.count <= 0) continue;
          insertInv.run(
            item.storage_id,
            item.card_id,
            item.count,
            item.condition || 'プレイ用',
            item.memo || '',
            item.updated_at || null
          );
        }
      } else {
        const existingStorages = db.prepare('SELECT id, name FROM storages').all() as { id: number; name: string }[];
        const storageIdMap = new Map<number, number>();

        const insertStorage = db.prepare('INSERT INTO storages (name, color, memo) VALUES (?, ?, ?)');
        for (const s of storages) {
          const found = existingStorages.find((es) => es.name === s.name);
          if (found) {
            storageIdMap.set(s.id, found.id);
          } else {
            const res = insertStorage.run(s.name || 'ストレージ', s.color || '#3b82f6', s.memo || '');
            const newId = Number(res.lastInsertRowid);
            existingStorages.push({ id: newId, name: s.name });
            storageIdMap.set(s.id, newId);
          }
        }

        const findInv = db.prepare(`
          SELECT id, count FROM inventory WHERE storage_id = ? AND card_id = ? AND condition = ?
        `);
        const updateInv = db.prepare(`
          UPDATE inventory SET count = ?, memo = COALESCE(?, memo), updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `);
        const insertInv = db.prepare(`
          INSERT INTO inventory (storage_id, card_id, count, condition, memo) VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of inventory) {
          if (!item.card_id || item.count <= 0) continue;
          const targetStorageId = storageIdMap.get(item.storage_id) || existingStorages[0]?.id || 1;
          const condition = item.condition || 'プレイ用';
          const existing = findInv.get(targetStorageId, item.card_id, condition) as { id: number; count: number } | undefined;

          if (existing) {
            updateInv.run(item.count, item.memo || null, existing.id);
          } else {
            insertInv.run(targetStorageId, item.card_id, item.count, condition, item.memo || '');
          }
        }
      }
    })();

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
