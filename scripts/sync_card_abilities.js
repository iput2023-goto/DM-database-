/**
 * 全カードの特殊能力テキスト（ability_text）を公式サイトから取得して
 * dm_cards.db へ同期する一括スクリプト。
 * 同一カード名（表面・裏面ペア）ごとに代表1件だけ通信して全型番へ反映します。
 */
const https = require('https');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'dm_cards.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// カラムが未作成なら追加
const cols = new Set(db.prepare('PRAGMA table_info(cards)').all().map((c) => c.name));
if (!cols.has('ability_text')) {
  db.exec('ALTER TABLE cards ADD COLUMN ability_text TEXT');
}

const CONCURRENCY = 100;
const BATCH_SAVE_SIZE = 400;
const agent = new https.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function fetchGet(url, retryCount = 2) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers: { 'User-Agent': UA }, timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return retry(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    function retry(err) {
      if (retryCount > 0) {
        setTimeout(() => fetchGet(url, retryCount - 1).then(resolve).catch(reject), 400);
      } else {
        reject(err);
      }
    }
    req.on('error', retry);
    req.on('timeout', () => {
      req.destroy();
      retry(new Error('Request timed out'));
    });
  });
}

function cleanHtmlText(rawHtml) {
  return rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function parseAbilityText(html) {
  if (!html) return null;
  const blocks = html.split("<div class='card-itself'>").slice(1);
  if (blocks.length === 0) return null;

  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const skillsMatch = block.match(/<td class=['"]skills(?:\s+full)?['"][^>]*>([\s\S]*?)<\/td>/);
    const skills = skillsMatch ? cleanHtmlText(skillsMatch[1]) : '';
    if (!skills) continue;

    if (i === 0) {
      parts.push(skills);
    } else {
      const nameMatch = block.match(/<h3 class=['"]card-name['"]>([^<]+)/);
      const faceName = nameMatch ? nameMatch[1].trim() : `裏面${i}`;
      parts.push(`【${faceName}】\n${skills}`);
    }
  }

  return parts.join('\n');
}

function getIdPriority(id, invSet) {
  if (invSet.has(id)) return 0;
  const lower = id.toLowerCase();
  if (lower.startsWith('dm26')) return 1;
  if (lower.startsWith('dm25')) return 2;
  if (lower.startsWith('dm24')) return 3;
  if (lower.startsWith('dm23')) return 4;
  if (lower.startsWith('dm22')) return 5;
  return 6;
}

async function main() {
  const startTime = Date.now();
  const invRows = db.prepare('SELECT DISTINCT card_id FROM inventory').all();
  const invSet = new Set(invRows.map((r) => r.card_id));

  const targetRows = db
    .prepare('SELECT id, name, alt_names FROM cards WHERE ability_text IS NULL')
    .all();

  if (targetRows.length === 0) {
    console.log('すべてのカードの特殊能力テキストはすでに同期済みです。');
    return;
  }

  // カード名（表面|裏面）ごとにグループ化して代表IDを選ぶ
  const groupMap = new Map();
  for (const r of targetRows) {
    const key = `${r.name}|${r.alt_names || ''}`;
    let grp = groupMap.get(key);
    if (!grp) {
      grp = { key, repId: r.id, repPrio: getIdPriority(r.id, invSet), ids: [] };
      groupMap.set(key, grp);
    }
    grp.ids.push(r.id);
    const prio = getIdPriority(r.id, invSet);
    if (prio < grp.repPrio) {
      grp.repPrio = prio;
      grp.repId = r.id;
    }
  }

  const groups = [...groupMap.values()].sort((a, b) => a.repPrio - b.repPrio);
  console.log(`未取得カード: ${targetRows.length} 枚 / ユニーク名グループ: ${groups.length} 件`);

  const updateStmt = db.prepare('UPDATE cards SET ability_text = ? WHERE id = ?');
  const saveBatch = db.transaction((items) => {
    for (const item of items) {
      for (const id of item.ids) {
        updateStmt.run(item.abilityText, id);
      }
    }
  });

  let processed = 0;
  let successCards = 0;
  let failedGroups = 0;
  let pendingSaves = [];

  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    const chunk = groups.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (grp) => {
        try {
          const html = await fetchGet(
            `https://dm.takaratomy.co.jp/card/detail/?id=${encodeURIComponent(grp.repId)}`
          );
          const abilityText = parseAbilityText(html);
          if (abilityText === null) return null;
          return { ids: grp.ids, abilityText };
        } catch {
          return null;
        }
      })
    );

    for (const r of results) {
      if (r) {
        pendingSaves.push(r);
        successCards += r.ids.length;
      } else {
        failedGroups++;
      }
    }

    processed += chunk.length;
    if (pendingSaves.length >= BATCH_SAVE_SIZE || processed >= groups.length) {
      if (pendingSaves.length > 0) {
        saveBatch(pendingSaves);
        pendingSaves = [];
      }
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `進捗: ${processed}/${groups.length} グループ (反映カード: ${successCards} 枚, 失敗グループ: ${failedGroups}, 経過: ${elapsedSec}秒)`
      );
    }
  }

  const totalWithAbility = db
    .prepare('SELECT COUNT(*) as c FROM cards WHERE ability_text IS NOT NULL')
    .get().c;
  console.log(`=== 同期完了！ ability_text登録済み: ${totalWithAbility} 枚 ===`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
