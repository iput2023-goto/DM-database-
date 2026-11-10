import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getDb } from './db';

const IMAGE_PREFIX = 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/';

export function generatePortableHtml(): string {
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

  const rawCards = db.prepare(`
    SELECT id, name, name_ruby, pack, type, civil, rarity, cost, power, race, image, alt_names, faces_json
    FROM cards
  `).all() as any[];

  const compactCards = rawCards.map((r) => [
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

  const cardsGzipBase64 = zlib.gzipSync(JSON.stringify(compactCards)).toString('base64');
  const initialDataJson = JSON.stringify({
    exportedAt: new Date().toISOString(),
    storages,
    inventory,
  }).replace(/</g, '\\u003c');

  const templatePath = path.join(process.cwd(), 'src', 'lib', 'portableTemplate.html');
  const template = fs.readFileSync(templatePath, 'utf8');

  const decksPath = path.join(process.cwd(), 'src', 'lib', 'preconstructedDecks.json');
  const decksJson = fs.existsSync(decksPath) ? fs.readFileSync(decksPath, 'utf8') : '[]';

  return template
    .replace('__IMAGE_PREFIX_JSON__', () => JSON.stringify(IMAGE_PREFIX))
    .replace('__INITIAL_DATA_JSON__', () => initialDataJson)
    .replace('__CARDS_GZIP_B64__', () => cardsGzipBase64)
    .replace('__DECKS_JSON__', () => decksJson);
}
