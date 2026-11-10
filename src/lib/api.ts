import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { normalizeForSearch } from '@/lib/normalize';
import { StorageItem, InventoryItem, CardMaster } from '@/types';

// ==========================================
// ネイティブ SQLite 接続管理 (Android用)
// ==========================================
let sqliteConnection: SQLiteConnection | null = null;
let dbInstance: SQLiteDBConnection | null = null;
let isDbInitialized = false;

async function getNativeDb(): Promise<SQLiteDBConnection> {
  if (dbInstance && isDbInitialized) return dbInstance;

  if (!sqliteConnection) {
    sqliteConnection = new SQLiteConnection(CapacitorSQLite);
  }

  try {
    // assets/databases/dm_cards.db を内部領域にコピー（初回のみ自動実行）
    await sqliteConnection.copyFromAssets();
  } catch (e) {
    console.warn('copyFromAssets error or already copied:', e);
  }

  // 接続の作成とオープン
  const isConn = (await sqliteConnection.isConnection('dm_cards', false)).result;
  if (isConn) {
    dbInstance = await sqliteConnection.retrieveConnection('dm_cards', false);
  } else {
    dbInstance = await sqliteConnection.createConnection(
      'dm_cards',
      false,
      'no-encryption',
      1,
      false
    );
  }

  if (dbInstance) {
    await dbInstance.open();

    // テーブルが存在しない場合のフォールバック作成
    await dbInstance.execute(`
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
    `);

    // 初期ストレージが存在しなければ1つ作成
    const countRes = await dbInstance.query('SELECT count(*) as count FROM storages');
    if ((countRes.values?.[0]?.count || 0) === 0) {
      await dbInstance.run(
        'INSERT INTO storages (name, color, memo) VALUES (?, ?, ?)',
        ['メイン保管庫', '#3b82f6', 'デフォルトの保管場所']
      );
    }

    isDbInitialized = true;
  }

  return dbInstance!;
}

// ==========================================
// 統合 API クライアント (Web/Native 自動判別)
// ==========================================

export const api = {
  /** カード検索 */
  async getCards(params: { q?: string; civil?: string; cost?: string; limit?: number }): Promise<{ cards: CardMaster[] }> {
    if (!Capacitor.isNativePlatform()) {
      const sp = new URLSearchParams();
      if (params.q) sp.set('q', params.q);
      if (params.civil) sp.set('civil', params.civil);
      if (params.cost) sp.set('cost', params.cost);
      if (params.limit) sp.set('limit', String(params.limit));

      const res = await fetch(`/api/cards?${sp.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch cards');
      return await res.json();
    }

    // Android ネイティブ SQLite
    const db = await getNativeDb();
    const q = normalizeForSearch(params.q);
    const civil = params.civil?.trim() || '';
    const cost = params.cost;
    const limit = Math.min(params.limit || 60, 150);

    const conditions: string[] = [];
    const queryParams: (string | number)[] = [];

    if (q) {
      conditions.push('search_key LIKE ?');
      queryParams.push(`%${q}%`);
    }
    if (civil && civil !== 'all') {
      conditions.push('civil LIKE ?');
      queryParams.push(`%${civil}%`);
    }
    if (cost !== null && cost !== undefined && cost !== '' && cost !== 'all') {
      conditions.push('cost = ?');
      queryParams.push(parseInt(cost, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortParams = q ? [`%|${q}|%`, `%|${q}%`] : ['', ''];

    const sql = `
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

    const res = await db.query(sql, [...queryParams, ...sortParams, limit]);
    const cards = (res.values || []).map(({ faces_json, ...rest }: any) => ({
      ...rest,
      faces: faces_json ? JSON.parse(faces_json) : [],
    }));

    return { cards };
  },

  /** ストレージ一覧取得 */
  async getStorages(): Promise<{ storages: StorageItem[] }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch('/api/storages');
      if (!res.ok) throw new Error('Failed to fetch storages');
      return await res.json();
    }

    const db = await getNativeDb();
    const sql = `
      SELECT 
        s.id,
        s.name,
        s.color,
        s.memo,
        COALESCE(SUM(i.count), 0) AS total_cards,
        COUNT(DISTINCT i.card_id) AS unique_cards
      FROM storages s
      LEFT JOIN inventory i ON s.id = i.storage_id
      GROUP BY s.id
      ORDER BY s.id ASC
    `;
    const res = await db.query(sql);
    return { storages: res.values || [] };
  },

  /** 新規ストレージ作成 */
  async createStorage(data: { name: string; color: string; memo?: string }): Promise<{ success: boolean; id?: number }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch('/api/storages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    }

    const db = await getNativeDb();
    const res = await db.run(
      'INSERT INTO storages (name, color, memo) VALUES (?, ?, ?)',
      [data.name.trim(), data.color || '#3b82f6', (data.memo || '').trim()]
    );
    return { success: true, id: res.changes?.lastId };
  },

  /** ストレージ削除 */
  async deleteStorage(id: number): Promise<{ success: boolean }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch(`/api/storages/${id}`, { method: 'DELETE' });
      return await res.json();
    }

    const db = await getNativeDb();
    await db.run('DELETE FROM inventory WHERE storage_id = ?', [id]);
    await db.run('DELETE FROM storages WHERE id = ?', [id]);
    return { success: true };
  },

  /** 保管中カード一覧取得 */
  async getInventory(storageId?: number | 'all'): Promise<{ items: InventoryItem[] }> {
    if (!Capacitor.isNativePlatform()) {
      const url = storageId && storageId !== 'all' ? `/api/inventory?storageId=${storageId}` : '/api/inventory';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch inventory');
      return await res.json();
    }

    const db = await getNativeDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (storageId && storageId !== 'all') {
      conditions.push('i.storage_id = ?');
      params.push(storageId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
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

    const res = await db.query(sql, params);
    return { items: res.values || [] };
  },

  /** カード追加 */
  async addInventory(data: {
    storage_id: number;
    card_id: string;
    count: number;
    condition?: string;
    memo?: string;
  }): Promise<{ success: boolean; id?: number }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    }

    const db = await getNativeDb();
    const condition = data.condition || 'プレイ用';
    const memo = data.memo || '';

    // 既存チェック
    const checkSql = `
      SELECT id, count FROM inventory 
      WHERE storage_id = ? AND card_id = ? AND condition = ?
    `;
    const checkRes = await db.query(checkSql, [data.storage_id, data.card_id, condition]);

    if (checkRes.values && checkRes.values.length > 0) {
      const existing = checkRes.values[0];
      const newCount = existing.count + data.count;
      await db.run(
        'UPDATE inventory SET count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newCount, existing.id]
      );
      return { success: true, id: existing.id };
    } else {
      const insertSql = `
        INSERT INTO inventory (storage_id, card_id, count, condition, memo)
        VALUES (?, ?, ?, ?, ?)
      `;
      const res = await db.run(insertSql, [data.storage_id, data.card_id, data.count, condition, memo]);
      return { success: true, id: res.changes?.lastId };
    }
  },

  /** 枚数変更 */
  async updateInventoryCount(id: number, count: number): Promise<{ success: boolean }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      return await res.json();
    }

    const db = await getNativeDb();
    if (count <= 0) {
      await db.run('DELETE FROM inventory WHERE id = ?', [id]);
    } else {
      await db.run(
        'UPDATE inventory SET count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [count, id]
      );
    }
    return { success: true };
  },

  /** 個別カード削除 */
  async deleteInventoryItem(id: number): Promise<{ success: boolean }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      return await res.json();
    }

    const db = await getNativeDb();
    await db.run('DELETE FROM inventory WHERE id = ?', [id]);
    return { success: true };
  },

  /** ストレージ内カード全削除 */
  async clearStorage(storageId: number | 'all'): Promise<{ success: boolean }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch(`/api/inventory?storageId=${storageId}`, { method: 'DELETE' });
      return await res.json();
    }

    const db = await getNativeDb();
    if (storageId !== 'all') {
      await db.run('DELETE FROM inventory WHERE storage_id = ?', [storageId]);
    } else {
      await db.run('DELETE FROM inventory');
    }
    return { success: true };
  },

  /** カードDB同期ステータス（ネイティブ時はローカルDB件数を返す） */
  async getSyncStatus(): Promise<{ dbCardsCount: number; isSyncing: boolean }> {
    if (!Capacitor.isNativePlatform()) {
      const res = await fetch('/api/sync');
      if (!res.ok) return { dbCardsCount: 24050, isSyncing: false };
      return await res.json();
    }

    try {
      const db = await getNativeDb();
      const res = await db.query('SELECT count(*) as count FROM cards');
      return {
        dbCardsCount: res.values?.[0]?.count || 24050,
        isSyncing: false,
      };
    } catch {
      return { dbCardsCount: 24050, isSyncing: false };
    }
  },
};
