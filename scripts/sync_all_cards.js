const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const querystring = require('querystring');
const { buildSearchKey } = require('./normalize');

const DB_PATH = path.join(__dirname, '..', 'dm_cards.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// テーブル初期化
db.exec(`
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

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// 裏面・覚醒面などの情報を保存する列を追加（既存DBのマイグレーション）
const existingCols = new Set(db.prepare('PRAGMA table_info(cards)').all().map((c) => c.name));
if (!existingCols.has('alt_names')) db.exec('ALTER TABLE cards ADD COLUMN alt_names TEXT');
if (!existingCols.has('faces_json')) db.exec('ALTER TABLE cards ADD COLUMN faces_json TEXT');
if (!existingCols.has('search_key')) db.exec('ALTER TABLE cards ADD COLUMN search_key TEXT');

function setSyncState(key, value) {
  db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(key, String(value));
}

const agent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// HTTP POST helper
function fetchPost(url, data, retryCount = 1) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(data);
    const req = https.request(url, {
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': UA,
      },
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    const retry = (err) => {
      if (retryCount > 0) setTimeout(() => fetchPost(url, data, retryCount - 1).then(resolve).catch(reject), 500);
      else reject(err);
    };
    req.on('error', retry);
    req.on('timeout', () => { req.destroy(); retry(new Error('Request timed out')); });
    req.write(postData);
    req.end();
  });
}

// HTTP GET helper
function fetchGet(url, retryCount = 1) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers: { 'User-Agent': UA }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    const retry = (err) => {
      if (retryCount > 0) setTimeout(() => fetchGet(url, retryCount - 1).then(resolve).catch(reject), 500);
      else reject(err);
    };
    req.on('error', retry);
    req.on('timeout', () => { req.destroy(); retry(new Error('Request timed out')); });
  });
}

function pick(block, regex) {
  const m = block.match(regex);
  return m ? m[1].trim() : '';
}

// 1面分（card-itself ブロック）を解析
function parseFace(block) {
  const nameMatch = block.match(/<h3 class='card-name'>([^<]+)<span class='packname'>(?:<span[^>]*>)?\(([^)]+)\)/);
  const name = nameMatch ? nameMatch[1].trim() : '';
  if (!name) return null;
  const costText = pick(block, /<td class='cost'>([^<]*)<\/td>/);
  const costVal = parseInt(costText, 10);
  const img = pick(block, /<div class="card-img"><img src="([^"]+)"/);
  return {
    name,
    pack: nameMatch[2].trim(),
    type: pick(block, /<td class='type'>([^<]*)<\/td>/),
    civil: pick(block, /<td class='civil'>([^<]*)<\/td>/),
    rarity: pick(block, /<td class='rarelity'>([^<]*)<\/td>/),
    cost: isNaN(costVal) ? null : costVal,
    power: pick(block, /<td class='power'>([^<]*)<\/td>/),
    race: pick(block, /<td class='race'>([^<]*)<\/td>/),
    image: img ? 'https://dm.takaratomy.co.jp' + img : '',
  };
}

// 詳細ページ全体を解析（サイキック・ドラグハート等の裏面／覚醒面もすべて取得）
function parseCardDetail(cardId, html) {
  if (!html) return null;
  const blocks = html.split("<div class='card-itself'>").slice(1);
  const faces = blocks.map(parseFace).filter(Boolean);

  if (faces.length === 0) {
    const t = html.match(/<title>([^<(]+)(?:\(([^)]+)\))?\s*\|\s*デュエル・マスターズ<\/title>/);
    if (!t) return null;
    faces.push({ name: t[1].trim(), pack: t[2] ? t[2].trim() : '', type: '', civil: '', rarity: '', cost: null, power: '', race: '', image: '' });
  }

  const front = faces[0];
  // 表面と異なる名前の面を「別名（裏面など）」として保持
  const altNames = [...new Set(faces.slice(1).map((f) => f.name).filter((n) => n && n !== front.name))];

  return {
    cardId,
    ...front,
    rarity: front.rarity || faces.find((f) => f.rarity)?.rarity || '',
    altNames,
    faces,
  };
}

function searchKeyFor(card) {
  return buildSearchKey([card.name, ...(card.altNames || []), card.pack, card.cardId, card.race]);
}

// 既存レコードの検索キーを補完（裏面情報がまだ無いカードも表面名で検索できるように）
function backfillSearchKeys() {
  const rows = db.prepare('SELECT id, name, alt_names, pack, race FROM cards WHERE search_key IS NULL').all();
  if (rows.length === 0) return;
  const upd = db.prepare('UPDATE cards SET search_key = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of rows) {
      const alts = r.alt_names ? r.alt_names.split(' / ') : [];
      upd.run(buildSearchKey([r.name, ...alts, r.pack, r.id, r.race]), r.id);
    }
  })();
  console.log(`検索キーを補完しました: ${rows.length} 件`);
}

async function fetchDetailsInBatches(ids, concurrency, onBatch) {
  let done = 0;
  for (let i = 0; i < ids.length; i += concurrency) {
    const batchIds = ids.slice(i, i + concurrency);
    const details = await Promise.all(
      batchIds.map(async (cardId) => {
        try {
          const html = await fetchGet(`https://dm.takaratomy.co.jp/card/detail/?id=${encodeURIComponent(cardId)}`);
          return parseCardDetail(cardId, html);
        } catch (e) {
          return null;
        }
      })
    );
    onBatch(details.filter(Boolean));
    done += batchIds.length;
    if (done % 350 === 0 || done === ids.length) {
      process.stdout.write(`\r  進捗: ${done}/${ids.length} 件`);
    }
  }
  process.stdout.write('\n');
}

async function collectAllCardIds(maxPages) {
  console.log('フェーズ1: カード一覧ページからカードIDリストを収集しています...');
  const allIds = [];
  const pageConcurrency = 10;
  for (let p = 1; p <= maxPages; p += pageConcurrency) {
    const pages = [];
    for (let i = 0; i < pageConcurrency && p + i <= maxPages; i++) pages.push(p + i);
    const results = await Promise.all(
      pages.map(async (pageNum) => {
        try {
          const html = await fetchPost('https://dm.takaratomy.co.jp/card/', { pagenum: pageNum, samename: 'show' });
          return [...new Set([...html.matchAll(/\/card\/detail\/\?id=([^'"]+)/g)].map((m) => m[1]))];
        } catch (err) {
          return [];
        }
      })
    );
    results.forEach((ids) => allIds.push(...ids));
    setSyncState('scanned_pages', Math.min(p + pageConcurrency - 1, maxPages));
    setSyncState('total_pages', maxPages);
  }
  return [...new Set(allIds)];
}

async function runSync(options = {}) {
  const maxPages = options.maxPages || 481;
  const concurrency = options.concurrency || 35;
  const repairOnly = !!options.repairOnly;

  setSyncState('is_syncing', 'true');
  console.log(`=== デュエル・マスターズ カード同期 (並列数: ${concurrency}${repairOnly ? ' / 裏面補完のみ' : ''}) ===`);

  try {
    backfillSearchKeys();

    const upsertStmt = db.prepare(`
      INSERT OR REPLACE INTO cards (id, name, pack, type, civil, rarity, cost, power, race, image, alt_names, faces_json, search_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertMany = db.transaction((cards) => {
      for (const c of cards) {
        upsertStmt.run(
          c.cardId, c.name, c.pack, c.type, c.civil, c.rarity, c.cost, c.power, c.race, c.image,
          c.altNames.length ? c.altNames.join(' / ') : null,
          JSON.stringify(c.faces),
          searchKeyFor(c)
        );
      }
    });

    // フェーズ1&2: 新規カードの取得
    if (!repairOnly) {
      const existingIds = new Set(db.prepare('SELECT id FROM cards').all().map((r) => r.id));
      const allIds = await collectAllCardIds(maxPages);
      setSyncState('total_ids_found', allIds.length);
      const idsToFetch = allIds.filter((id) => !existingIds.has(id));
      console.log(`全カードID: ${allIds.length} 件 / 新規取得: ${idsToFetch.length} 件`);
      if (idsToFetch.length > 0) {
        console.log('フェーズ2: 新規カードの詳細情報を取得しています...');
        await fetchDetailsInBatches(idsToFetch, concurrency, (cards) => {
          if (cards.length) upsertMany(cards);
          const total = db.prepare('SELECT COUNT(*) c FROM cards').get().c;
          setSyncState('current_synced', total);
          setSyncState('sync_progress_percent', Math.min(100, Math.round((total / allIds.length) * 100)));
        });
      }
    }

    // フェーズ3: 複数面カード（画像名が ...a.jpg）で裏面情報が未取得のものを補完
    const idsToRepair = db
      .prepare("SELECT id FROM cards WHERE image LIKE '%a.jpg' AND faces_json IS NULL")
      .all()
      .map((r) => r.id);
    console.log(`フェーズ3: 裏面・覚醒面の情報を補完する対象: ${idsToRepair.length} 件`);
    if (idsToRepair.length > 0) {
      await fetchDetailsInBatches(idsToRepair, concurrency, (cards) => {
        if (cards.length) upsertMany(cards);
      });
    }

    const altCount = db.prepare('SELECT COUNT(*) c FROM cards WHERE alt_names IS NOT NULL').get().c;
    console.log(`=== 同期完了！ 裏面・別名を持つカード: ${altCount} 件 ===`);
    setSyncState('sync_progress_percent', 100);
    setSyncState('last_sync_completed_at', new Date().toISOString());
  } catch (err) {
    console.error('同期エラー:', err);
    setSyncState('sync_error', err.message);
  } finally {
    setSyncState('is_syncing', 'false');
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const repairOnly = args.includes('--repair-only');
  const pageArg = args.find((a) => /^\d+$/.test(a));
  runSync({ maxPages: pageArg ? parseInt(pageArg, 10) : 481, repairOnly });
}

module.exports = { runSync, parseCardDetail };
