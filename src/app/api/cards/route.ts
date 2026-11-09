import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeForSearch } from '@/lib/normalize';

interface CardRow {
  id: string;
  name: string;
  name_ruby: string | null;
  pack: string;
  type: string;
  civil: string;
  rarity: string;
  cost: number | null;
  power: string;
  race: string;
  image: string;
  alt_names: string | null;
  faces_json: string | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = normalizeForSearch(searchParams.get('q'));
    const civil = searchParams.get('civil')?.trim() || '';
    const cost = searchParams.get('cost');
    const limit = Math.min(parseInt(searchParams.get('limit') || '60', 10), 150);

    const db = getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // 表面・裏面（覚醒面）・型番・ID・種族のすべてを対象に検索
    if (q) {
      conditions.push('search_key LIKE ?');
      params.push(`%${q}%`);
    }

    if (civil) {
      conditions.push('civil LIKE ?');
      params.push(`%${civil}%`);
    }

    if (cost !== null && cost !== undefined && cost !== '') {
      conditions.push('cost = ?');
      params.push(parseInt(cost, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // search_key は |表面名|裏面名|...|型番|ID|種族| 形式
    // 1: いずれかの面の名前と完全一致 / 2: いずれかの面の名前・型番に前方一致 / 3: 部分一致
    const query = `
      SELECT id, name, name_ruby, pack, type, civil, rarity, cost, power, race, image, alt_names, faces_json
      FROM cards
      ${whereClause}
      ORDER BY
        CASE
          WHEN search_key LIKE ? THEN 1
          WHEN search_key LIKE ? THEN 2
          ELSE 3
        END,
        cost ASC,
        id DESC
      LIMIT ?
    `;

    const sortParams = q ? [`%|${q}|%`, `%|${q}%`] : ['', ''];
    const rows = db.prepare(query).all(...params, ...sortParams, limit) as CardRow[];

    const cards = rows.map(({ faces_json, ...rest }) => ({
      ...rest,
      faces: faces_json ? JSON.parse(faces_json) : [],
    }));

    return NextResponse.json({ cards });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
