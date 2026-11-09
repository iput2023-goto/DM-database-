import Database from 'better-sqlite3';
import path from 'path';
import { buildSearchKey } from './normalize';

const DB_PATH = path.join(process.cwd(), 'dm_cards.db');

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // テーブルの作成
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pack TEXT,
      type TEXT,
      civil TEXT,
      rarity TEXT,
      cost INTEGER,
      power TEXT,
      race TEXT,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
    CREATE INDEX IF NOT EXISTS idx_cards_pack ON cards(pack);
    CREATE INDEX IF NOT EXISTS idx_cards_civil ON cards(civil);
    CREATE INDEX IF NOT EXISTS idx_cards_cost ON cards(cost);

    CREATE TABLE IF NOT EXISTS storages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_id INTEGER NOT NULL REFERENCES storages(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      count INTEGER NOT NULL DEFAULT 1,
      condition TEXT NOT NULL DEFAULT 'プレイ用',
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_storage ON inventory(storage_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_card ON inventory(card_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // フリガナ（ルビ）・裏面（覚醒面）情報と検索キーの列を追加（既存DBのマイグレーション）
  const cols = new Set(
    (dbInstance.prepare('PRAGMA table_info(cards)').all() as { name: string }[]).map((c) => c.name)
  );
  if (!cols.has('name_ruby')) dbInstance.exec('ALTER TABLE cards ADD COLUMN name_ruby TEXT');
  if (!cols.has('alt_names')) dbInstance.exec('ALTER TABLE cards ADD COLUMN alt_names TEXT');
  if (!cols.has('faces_json')) dbInstance.exec('ALTER TABLE cards ADD COLUMN faces_json TEXT');
  if (!cols.has('search_key')) dbInstance.exec('ALTER TABLE cards ADD COLUMN search_key TEXT');

  // 検索キーが未設定のカードを補完
  const missing = dbInstance
    .prepare('SELECT id, name, name_ruby, alt_names, pack, race FROM cards WHERE search_key IS NULL')
    .all() as { id: string; name: string; name_ruby: string | null; alt_names: string | null; pack: string; race: string }[];
  if (missing.length > 0) {
    const upd = dbInstance.prepare('UPDATE cards SET search_key = ? WHERE id = ?');
    dbInstance.transaction(() => {
      for (const r of missing) {
        const alts = r.alt_names ? r.alt_names.split(' / ') : [];
        upd.run(buildSearchKey([r.name, r.name_ruby, ...alts, r.pack, r.id, r.race]), r.id);
      }
    })();
  }

  // 初期ストレージが存在しなければ作成
  const count = dbInstance.prepare('SELECT COUNT(*) as c FROM storages').get() as { c: number };
  if (count.c === 0) {
    const insertStorage = dbInstance.prepare('INSERT INTO storages (name, color, memo) VALUES (?, ?, ?)');
    insertStorage.run('ストレージBOX 1（メイン保管）', '#3b82f6', '大容量ストレージ箱');
    insertStorage.run('デッキケース 1', '#ef4444', '大会用・調整中デッキ');
    insertStorage.run('コレクションバインダー', '#f59e0b', 'SR・高額・お気に入りカード');
  }

  return dbInstance;
}

