const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { normalizeForSearch, buildSearchKey } = require('./normalize');

const DB_PATH = path.join(__dirname, '..', 'dm_cards.db');
const SCRATCH_RUBIES = 'C:/Users/kaito/.gemini/antigravity/brain/f90743e4-170c-4b5c-a5cc-598c02bcb7cf/scratch/dmwiki_rubies.json';
const LOCAL_RUBIES = path.join(__dirname, 'dmwiki_rubies.json');

function fuzzyNorm(str) {
  if (!str) return '';
  let s = String(str).normalize('NFKC');
  s = s.replace(/[’'‘`´]/g, "'");
  s = s.replace(/[”"“‟]/g, '"');
  s = s.replace(/[〜～~]/g, '~');
  s = s.replace(/[－―—ー\-]/g, '-');
  return normalizeForSearch(s).replace(/['"~\-]/g, '');
}

function main() {
  const rubySource = fs.existsSync(LOCAL_RUBIES) ? LOCAL_RUBIES : SCRATCH_RUBIES;
  if (!fs.existsSync(rubySource)) {
    console.error('Ruby JSON file not found:', rubySource);
    process.exit(1);
  }
  if (rubySource === SCRATCH_RUBIES && !fs.existsSync(LOCAL_RUBIES)) {
    fs.copyFileSync(SCRATCH_RUBIES, LOCAL_RUBIES);
  }

  const entries = JSON.parse(fs.readFileSync(rubySource, 'utf8'));
  console.log(`Loaded ${entries.length} ruby entries.`);

  const byExact = new Map();
  const byFuzzy = new Map();
  const byNoBracket = new Map();

  function register(baseName, entry) {
    const exact = normalizeForSearch(baseName);
    const fuzzy = fuzzyNorm(baseName);
    if (exact && !byExact.has(exact)) byExact.set(exact, entry);
    if (fuzzy && !byFuzzy.has(fuzzy)) byFuzzy.set(fuzzy, entry);

    // Star進化などで公式DB側が <...> をタグとして除去しているケースへの対応
    const stripped = baseName.replace(/\s*[＜<][^＞>]+[＞>]/g, '').trim();
    if (stripped && stripped !== baseName) {
      const sf = fuzzyNorm(stripped);
      if (sf && !byNoBracket.has(sf)) byNoBracket.set(sf, entry);
    }
  }

  for (const e of entries) {
    register(e.baseName, e);
    // ツインパクト（A／B）の片面ずつも登録
    if (e.baseName.includes('／') && e.rubyReading.includes('／')) {
      const bParts = e.baseName.split('／').map((s) => s.trim());
      const rParts = e.rubyReading.split('／').map((s) => s.trim());
      const kParts = e.katakanaMix ? e.katakanaMix.split('／').map((s) => s.trim()) : [];
      if (bParts.length === rParts.length) {
        for (let i = 0; i < bParts.length; i++) {
          if (bParts[i] && rParts[i] && bParts[i] !== rParts[i]) {
            register(bParts[i], {
              baseName: bParts[i],
              rubyReading: rParts[i],
              katakanaMix: kParts[i] && kParts[i] !== bParts[i] ? kParts[i] : undefined,
              rubyParts: rParts[i],
            });
          }
        }
      }
    }
  }

  function findEntrySingle(name) {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const exact = normalizeForSearch(trimmed);
    const fuzzy = fuzzyNorm(trimmed);
    const noPs = fuzzyNorm(trimmed.replace(/P['’]S$/i, ''));
    const found = byExact.get(exact) || byFuzzy.get(fuzzy) || byNoBracket.get(fuzzy) || byFuzzy.get(noPs);
    if (found) return found;

    // 初期カードの「青銅の鎧(ブロンズ・アーム・トライブ)」形式
    const parenMatch = trimmed.match(/^(.+?)\(([\u30A0-\u30FF・ー\s]+)\)$/);
    if (parenMatch) {
      return {
        baseName: parenMatch[1].trim(),
        rubyReading: parenMatch[2].trim(),
        rubyParts: parenMatch[2].trim(),
      };
    }
    return null;
  }

  function resolveRubyInfo(rawName) {
    if (!rawName) return { displayRuby: null, extraTerms: [] };
    const direct = findEntrySingle(rawName);
    if (direct) {
      return {
        displayRuby: direct.rubyReading,
        extraTerms: [direct.rubyReading, direct.katakanaMix, direct.rubyParts, direct.baseName].filter(Boolean),
      };
    }

    // 「 | 」または「 / 」区切りの複合名
    for (const sep of [' | ', ' / ', '／']) {
      if (rawName.includes(sep)) {
        const parts = rawName.split(sep).map((s) => s.trim()).filter(Boolean);
        const subInfos = parts.map((p) => {
          const e = findEntrySingle(p);
          return { part: p, entry: e };
        });
        if (subInfos.some((s) => s.entry)) {
          const displayRuby = subInfos.map((s) => (s.entry ? s.entry.rubyReading : s.part)).join(sep === '／' ? ' / ' : sep);
          const extraTerms = [displayRuby];
          for (const s of subInfos) {
            if (s.entry) {
              extraTerms.push(s.entry.rubyReading, s.entry.katakanaMix, s.entry.rubyParts, s.entry.baseName);
            }
          }
          return { displayRuby, extraTerms: extraTerms.filter(Boolean) };
        }
      }
    }

    // 改行や [ ] を含むコラボカード
    const extraTerms = [];
    let displayRuby = null;
    if (rawName.includes('\n')) {
      for (const line of rawName.split(/\r?\n/)) {
        const e = findEntrySingle(line);
        if (e) {
          if (!displayRuby) displayRuby = e.rubyReading;
          extraTerms.push(e.rubyReading, e.katakanaMix, e.rubyParts, e.baseName);
        }
      }
    }
    const bracketMatch = rawName.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
      const e = findEntrySingle(bracketMatch[1]);
      if (e) {
        if (!displayRuby) displayRuby = e.rubyReading;
        extraTerms.push(e.rubyReading, e.katakanaMix, e.rubyParts, e.baseName);
      }
    }

    return { displayRuby, extraTerms: extraTerms.filter(Boolean) };
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const cols = new Set(db.prepare('PRAGMA table_info(cards)').all().map((c) => c.name));
  if (!cols.has('name_ruby')) {
    db.exec('ALTER TABLE cards ADD COLUMN name_ruby TEXT');
  }

  // DM26-EX5 デュエマプレイス・コラボパック「電脳対戦 -WAR OF PLAY'S-」の超シークレット（㊙1超/㊙6〜㊙6超/㊙6）を補完
  const dm26ex5ChoSec = [
    {
      id: 'dm26ex5-SEC001CHO',
      name: '「誣」の頂 ウェディング・イノセンス',
      pack: 'DM26EX5 ㊙1超/㊙6',
      type: 'クリーチャー',
      civil: 'ゼロ',
      rarity: 'SR',
      cost: 13,
      power: '13000',
      race: 'アンノウン/ゼニス',
      image: 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26ex5-SEC001CHO.jpg',
    },
    {
      id: 'dm26ex5-SEC002CHO',
      name: 'クリスタル・ツヴァイランサーP’S',
      pack: 'DM26EX5 ㊙2超/㊙6',
      type: '進化クリーチャー',
      civil: '水',
      rarity: 'SR',
      cost: 8,
      power: '13000',
      race: 'リキッド・ピープル',
      image: 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26ex5-SEC002CHO.jpg',
    },
    {
      id: 'dm26ex5-SEC003CHO',
      name: 'フェリックス・ミザリィ',
      pack: 'DM26EX5 ㊙3超/㊙6',
      type: 'NEOクリーチャー',
      civil: '闇',
      rarity: 'SR',
      cost: 6,
      power: '6000',
      race: 'マフィ・ギャング',
      image: 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26ex5-SEC003CHO.jpg',
    },
    {
      id: 'dm26ex5-SEC004CHO',
      name: 'ダイヤモンド・ブリザードP’S',
      pack: 'DM26EX5 ㊙4超/㊙6',
      type: '進化クリーチャー',
      civil: '自然',
      rarity: 'SR',
      cost: 3,
      power: '5000',
      race: 'スノーフェアリー',
      image: 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26ex5-SEC004CHO.jpg',
    },
    {
      id: 'dm26ex5-SEC005CHO',
      name: '龍聖霊マギア・デル・フィン',
      pack: 'DM26EX5 ㊙5超/㊙6',
      type: 'クリーチャー',
      civil: '光/水',
      rarity: 'SR',
      cost: 9,
      power: '6000+',
      race: 'アポロニア・ドラゴン/エンジェル・コマンド',
      image: 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26ex5-SEC005CHO.jpg',
    },
    {
      id: 'dm26ex5-SEC006CHO',
      name: '無限龍王ボルシャック・ライジングNEX',
      pack: 'DM26EX5 ㊙6超/㊙6',
      type: '進化クリーチャー',
      civil: '光/火/自然',
      rarity: 'SR',
      cost: 7,
      power: '15000',
      race: 'ルナティック・エンペラー/アーマード・ドラゴン/フェニックス',
      image: 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26ex5-SEC006CHO.jpg',
    },
  ];
  const insertChoStmt = db.prepare(`
    INSERT INTO cards (id, name, pack, type, civil, rarity, cost, power, race, image)
    VALUES (@id, @name, @pack, @type, @civil, @rarity, @cost, @power, @race, @image)
    ON CONFLICT(id) DO UPDATE SET
      image = excluded.image,
      pack = excluded.pack,
      name = excluded.name
  `);
  for (const c of dm26ex5ChoSec) {
    insertChoStmt.run(c);
  }

  const rows = db.prepare('SELECT id, name, pack, race, alt_names, faces_json FROM cards').all();
  const updateStmt = db.prepare('UPDATE cards SET name_ruby = ?, faces_json = ?, search_key = ? WHERE id = ?');

  let rubyMatchedCards = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const mainInfo = resolveRubyInfo(r.name);
      const searchParts = [r.name, ...mainInfo.extraTerms];

      // alt_names のルビ解決
      const altList = [];
      if (r.alt_names) {
        try {
          const parsed = JSON.parse(r.alt_names);
          if (Array.isArray(parsed)) altList.push(...parsed);
        } catch {
          altList.push(...r.alt_names.split(' / '));
        }
      }
      for (const alt of altList) {
        if (!alt) continue;
        searchParts.push(alt);
        const altInfo = resolveRubyInfo(alt);
        searchParts.push(...altInfo.extraTerms);
      }

      // faces_json の各面にも ruby を付与
      let updatedFacesJson = r.faces_json;
      if (r.faces_json) {
        try {
          const faces = JSON.parse(r.faces_json);
          if (Array.isArray(faces)) {
            for (const f of faces) {
              if (f && f.name) {
                const fInfo = resolveRubyInfo(f.name);
                if (fInfo.displayRuby) {
                  f.ruby = fInfo.displayRuby;
                }
                searchParts.push(f.name, ...fInfo.extraTerms);
              }
            }
            updatedFacesJson = JSON.stringify(faces);
          }
        } catch {}
      }

      searchParts.push(r.pack, r.id, r.race);
      if (r.pack && r.pack.startsWith('DM26EX5')) {
        searchParts.push("DM26-EX5 デュエル・マスターズTCG デュエマプレイス・コラボパック 電脳対戦 -WAR OF PLAY'S- デュエプレ");
      }
      const uniqueSearchParts = [...new Set(searchParts.filter(Boolean))];
      const newSearchKey = buildSearchKey(uniqueSearchParts);

      if (mainInfo.displayRuby || uniqueSearchParts.length > 4) {
        rubyMatchedCards++;
      }

      updateStmt.run(mainInfo.displayRuby, updatedFacesJson, newSearchKey, r.id);
    }
  });

  tx();
  console.log(`Updated ${rows.length} cards in dm_cards.db (cards with ruby/extra readings: ${rubyMatchedCards}).`);
}

main();

