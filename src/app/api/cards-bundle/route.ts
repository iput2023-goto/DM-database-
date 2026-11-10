import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const IMAGE_PREFIX = 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, name, name_ruby, pack, type, civil, rarity, cost, power, race, image, alt_names, faces_json
      FROM cards
    `).all() as {
      id: string;
      name: string;
      name_ruby: string | null;
      pack: string | null;
      type: string | null;
      civil: string | null;
      rarity: string | null;
      cost: number | null;
      power: string | null;
      race: string | null;
      image: string | null;
      alt_names: string | null;
      faces_json: string | null;
    }[];

    const cards = rows.map((r) => [
      r.id,
      r.name,
      r.name_ruby || '',
      r.pack || '',
      r.type || '',
      r.civil || '',
      r.rarity || '',
      r.cost,
      r.power || '',
      r.race || '',
      (r.image || '').replace(IMAGE_PREFIX, ''),
      r.alt_names || '',
      r.faces_json ? r.faces_json.replaceAll(IMAGE_PREFIX, '') : '',
    ]);

    return NextResponse.json({ count: cards.length, cards });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

