const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'dm_cards.db'));

// Helper to get base cards for a packPrefix or idPrefix (excluding SP / STAR variants)
function getDeckBaseCards({ packPrefix, idPrefix }) {
  let rows = [];
  if (idPrefix) {
    rows = db.prepare('SELECT id, name, pack, rarity, cost FROM cards WHERE id LIKE ? ORDER BY id ASC').all(idPrefix + '%');
  } else if (packPrefix) {
    rows = db.prepare('SELECT id, name, pack, rarity, cost FROM cards WHERE pack LIKE ? ORDER BY id ASC').all(packPrefix + ' %');
  }
  // Filter out SP / STAR / secret duplicates
  const filtered = rows.filter((r) => {
    if (r.id.endsWith('STAR')) return false;
    if (/-SP\d+$/i.test(r.id)) return false;
    if (/\bSP\d+\//i.test(r.pack)) return false;
    if (/☆\//.test(r.pack)) return false;
    return true;
  });
  // Deduplicate by card number before slash (e.g. "1/16", "2F/16" -> "2/16")
  const seenNum = new Set();
  const deduped = [];
  for (const r of filtered) {
    const m = r.pack.match(/\s(\d+)[A-Za-z]*\/(\d+)/);
    if (m) {
      const key = m[1] + '/' + m[2];
      if (seenNum.has(key)) continue;
      seenNum.add(key);
    }
    deduped.push(r);
  }
  return deduped;
}

// Compute default 40-card (or 60-card) counts when exact counts are not manually specified
function buildDefaultCounts(cards, targetTotal = 40) {
  const counts = {};
  if (cards.length === 0) return counts;
  if (cards.length >= 40) {
    // 60-card Dueparty decks or large sets: 1 copy each
    for (const c of cards) counts[c.id] = 1;
    return counts;
  }
  // Distribute targetTotal (40) across cards.length (usually 11..21 cards), max 4 per card
  // Start with 2 copies each, then bump from bottom (lower number / staple cards) up to 4, or reduce top cards to 1
  for (const c of cards) counts[c.id] = 2;
  let sum = cards.length * 2;
  // Bump from the end (spells/staples at higher collector numbers in DM decks) up to 4
  for (let pass = 0; pass < 2 && sum < targetTotal; pass++) {
    for (let i = cards.length - 1; i >= 0 && sum < targetTotal; i--) {
      if (counts[cards[i].id] < 4) {
        counts[cards[i].id]++;
        sum++;
      }
    }
  }
  // If sum > targetTotal (e.g. 21 cards * 2 = 42 > 40), reduce top cards to 1
  for (let i = 0; i < cards.length && sum > targetTotal; i++) {
    if (counts[cards[i].id] > 1) {
      counts[cards[i].id]--;
      sum--;
    }
  }
  return counts;
}

const MANUAL_DECKS = [
  // === 2025年 ===
  {
    id: 'DM25SD1',
    code: 'DM25-SD1',
    name: 'いきなりつよいデッキ 技の王道',
    aliases: ['技の王道', 'わざのおうどう', 'いきなりつよいデッキ 技の王道', 'DM25-SD1', 'DM25SD1', '赤黒アビス', '火闇アビス', 'ジャシン帝デッキ'],
    packPrefix: 'DM25SD1',
    counts: {
      'dm25sd1-001': 2,
      'dm25sd1-002': 4,
      'dm25sd1-003': 4,
      'dm25sd1-004': 2,
      'dm25sd1-005': 3,
      'dm25sd1-006': 2,
      'dm25sd1-007': 3,
      'dm25sd1-008': 4,
      'dm25sd1-009': 4,
      'dm25sd1-010': 4,
      'dm25sd1-011': 4,
      'dm25sd1-012': 2,
      'dm25sd1-013': 2,
    },
  },
  {
    id: 'DM25SD2',
    code: 'DM25-SD2',
    name: 'いきなりつよいデッキ 力の王道',
    aliases: ['力の王道', 'ちからのおうどう', 'いきなりつよいデッキ 力の王道', 'DM25-SD2', 'DM25SD2', '赤緑アポロ', '火自然レッドゾーン', 'レッドゾーンデッキ'],
    packPrefix: 'DM25SD2',
    counts: {
      'dm25sd2-001': 4,
      'dm25sd2-002': 4,
      'dm25sd2-003': 1,
      'dm25sd2-004': 4,
      'dm25sd2-005': 4,
      'dm25sd2-006': 3,
      'dm25sd2-007': 4,
      'dm25sd2-008': 4,
      'dm25sd2-009': 4,
      'dm25sd2-010': 4,
      'dm25sd2-011': 4,
    },
  },
  {
    id: 'DM25BD1',
    code: 'DM25-BD1',
    name: 'ドリーム英雄譚デッキ ボルシャックの書',
    aliases: ['ボルシャックの書', 'ドリーム英雄譚デッキ ボルシャックの書', 'DM25-BD1', 'DM25BD1'],
    packPrefix: 'DM25BD1',
    counts: {
      'dm25bd1-001': 3,
      'dm25bd1-002': 2,
      'dm25bd1-003': 2,
      'dm25bd1-004': 2,
      'dm25bd1-005': 2,
      'dm25bd1-006': 1,
      'dm25bd1-007': 2,
      'dm25bd1-008': 2,
      'dm25bd1-009': 1,
      'dm25bd1-010': 1,
      'dm25bd1-011': 4,
      'dm25bd1-012': 2,
      'dm25bd1-013': 3,
      'dm25bd1-014': 3,
      'dm25bd1-015': 2,
      'dm25bd1-016': 4,
      'dm25bd1-017': 4,
    },
  },
  {
    id: 'DM25BD2',
    code: 'DM25-BD2',
    name: 'ドリーム英雄譚デッキ アルカディアスの書',
    aliases: ['アルカディアスの書', 'ドリーム英雄譚デッキ アルカディアスの書', 'DM25-BD2', 'DM25BD2'],
    packPrefix: 'DM25BD2',
    counts: {
      'dm25bd2-001': 3,
      'dm25bd2-002': 1,
      'dm25bd2-003': 1,
      'dm25bd2-004': 2,
      'dm25bd2-005': 2,
      'dm25bd2-006': 1,
      'dm25bd2-007': 2,
      'dm25bd2-008': 2,
      'dm25bd2-009': 4,
      'dm25bd2-010': 2,
      'dm25bd2-011': 4,
      'dm25bd2-012': 3,
      'dm25bd2-013': 3,
      'dm25bd2-014': 4,
      'dm25bd2-015': 2,
      'dm25bd2-016': 4,
    },
  },
  {
    id: 'DM25BD3',
    code: 'DM25-BD3',
    name: 'ドリーム英雄譚デッキ グレンモルトの書',
    aliases: ['グレンモルトの書', 'モルトの書', 'ドリーム英雄譚デッキ グレンモルトの書', 'DM25-BD3', 'DM25BD3'],
    packPrefix: 'DM25BD3',
    counts: {
      'dm25bd3-001': 1,
      'dm25bd3-002': 1,
      'dm25bd3-003': 1,
      'dm25bd3-004': 1,
      'dm25bd3-005': 1,
      'dm25bd3-006': 1,
      'dm25bd3-007': 1,
      'dm25bd3-008': 1,
      'dm25bd3-009': 3,
      'dm25bd3-010': 4,
      'dm25bd3-011': 2,
      'dm25bd3-012': 3,
      'dm25bd3-013': 2,
      'dm25bd3-014': 2,
      'dm25bd3-015': 4,
      'dm25bd3-016': 4,
      'dm25bd3-017': 4,
      'dm25bd3-018': 4,
      'dm25bd3-019': 4,
      'dm25bd3-020': 4,
    },
  },

  // === 2024年 ===
  {
    id: 'DM24SD1',
    code: 'DM24-SD1',
    name: 'いきなりつよいデッキ 攻めの王道',
    aliases: ['攻めの王道', 'せめのおうどう', 'いきなりつよいデッキ 攻めの王道', 'DM24-SD1', 'DM24SD1', '赤単我我我', '火単速攻'],
    packPrefix: 'DM24SD1',
    counts: {
      'dm24sd1-001': 4,
      'dm24sd1-002': 1,
      'dm24sd1-003': 2,
      'dm24sd1-004': 4,
      'dm24sd1-005': 4,
      'dm24sd1-006': 2,
      'dm24sd1-007': 4,
      'dm24sd1-008': 4,
      'dm24sd1-009': 4,
      'dm24sd1-010': 3,
      'dm24sd1-011': 4,
      'dm24sd1-012': 4,
    },
  },
  {
    id: 'DM24SD2',
    code: 'DM24-SD2',
    name: 'いきなりつよいデッキ 守りの王道',
    aliases: ['守りの王道', 'まもりのおうどう', 'いきなりつよいデッキ 守りの王道', 'DM24-SD2', 'DM24SD2', '巨大天門', '白緑天門', 'ヘブンズゲートデッキ'],
    packPrefix: 'DM24SD2',
    counts: {
      'dm24sd2-001': 4,
      'dm24sd2-002': 2,
      'dm24sd2-003': 4,
      'dm24sd2-004': 2,
      'dm24sd2-005': 4,
      'dm24sd2-006': 4,
      'dm24sd2-007': 4,
      'dm24sd2-008': 4,
      'dm24sd2-009': 4,
      'dm24sd2-010': 4,
      'dm24sd2-011': 4,
    },
  },
  {
    id: 'DM24BD1',
    code: 'DM24-BD1',
    name: 'ドリーム英雄譚デッキ ドギラゴンの書',
    aliases: ['ドギラゴンの書', 'ドリーム英雄譚デッキ ドギラゴンの書', 'DM24-BD1', 'DM24BD1'],
    packPrefix: 'DM24BD1',
    counts: {
      'dm24bd1-001': 3,
      'dm24bd1-002': 2,
      'dm24bd1-003': 1,
      'dm24bd1-004': 3,
      'dm24bd1-005': 1,
      'dm24bd1-006': 1,
      'dm24bd1-007': 1,
      'dm24bd1-008': 2,
      'dm24bd1-009': 3,
      'dm24bd1-010': 2,
      'dm24bd1-011': 2,
      'dm24bd1-012': 2,
      'dm24bd1-013': 2,
      'dm24bd1-014': 2,
      'dm24bd1-015': 2,
      'dm24bd1-016': 2,
      'dm24bd1-017': 2,
      'dm24bd1-018': 1,
      'dm24bd1-019': 4,
      'dm24bd1-020': 1,
      'dm24bd1-021': 1,
    },
  },
  {
    id: 'DM24BD2',
    code: 'DM24-BD2',
    name: 'ドリーム英雄譚デッキ ジョニーの書',
    aliases: ['ジョニーの書', 'ドリーム英雄譚デッキ ジョニーの書', 'DM24-BD2', 'DM24BD2'],
    packPrefix: 'DM24BD2',
    counts: {
      'dm24bd2-001': 3,
      'dm24bd2-002': 1,
      'dm24bd2-003': 3,
      'dm24bd2-004': 1,
      'dm24bd2-005': 3,
      'dm24bd2-006': 1,
      'dm24bd2-007': 2,
      'dm24bd2-008': 2,
      'dm24bd2-009': 2,
      'dm24bd2-010': 4,
      'dm24bd2-011': 2,
      'dm24bd2-012': 2,
      'dm24bd2-013': 2,
      'dm24bd2-014': 4,
      'dm24bd2-015': 4,
      'dm24bd2-016': 4,
    },
  },
  {
    id: 'DM24BD3',
    code: 'DM24-BD3',
    name: 'ドリーム英雄譚デッキ モモキングの書',
    aliases: ['モモキングの書', 'ドリーム英雄譚デッキ モモキングの書', 'DM24-BD3', 'DM24BD3'],
    packPrefix: 'DM24BD3',
    counts: {
      'dm24bd3-001': 3,
      'dm24bd3-002': 4,
      'dm24bd3-003': 4,
      'dm24bd3-004': 4,
      'dm24bd3-005': 2,
      'dm24bd3-006': 1,
      'dm24bd3-007': 1,
      'dm24bd3-008': 1,
      'dm24bd3-009': 3,
      'dm24bd3-010': 3,
      'dm24bd3-011': 4,
      'dm24bd3-012': 1,
      'dm24bd3-013': 1,
      'dm24bd3-014': 4,
      'dm24bd3-015': 4,
    },
  },
  {
    id: 'DM24BD4',
    code: 'DM24-BD4',
    name: 'ナイトメア黙示録デッキ バロムの章',
    aliases: ['バロムの章', 'バロムの書', 'ナイトメア黙示録デッキ バロムの章', 'DM24-BD4', 'DM24BD4'],
    packPrefix: 'DM24BD4',
    counts: {
      'dm24bd4-001': 3,
      'dm24bd4-002': 2,
      'dm24bd4-003': 1,
      'dm24bd4-004': 2,
      'dm24bd4-005': 2,
      'dm24bd4-006': 3,
      'dm24bd4-007': 3,
      'dm24bd4-008': 2,
      'dm24bd4-009': 4,
      'dm24bd4-010': 3,
      'dm24bd4-011': 3,
      'dm24bd4-012': 3,
      'dm24bd4-013': 3,
      'dm24bd4-014': 4,
      'dm24bd4-015': 2,
    },
  },
  {
    id: 'DM24BD5',
    code: 'DM24-BD5',
    name: 'エキサイティング・デュエパ・デッキ アセビと異世界フェアリーたち',
    aliases: ['アセビと異世界フェアリーたち', '異世界フェアリー', 'アセビデッキ', 'DM24-BD5', 'DM24BD5'],
    packPrefix: 'DM24BD5',
  },
  {
    id: 'DM24BD6',
    code: 'DM24-BD6',
    name: 'エキサイティング・デュエパ・デッキ ツラトゥストラは水晶と語らう',
    aliases: ['ツラトゥストラは水晶と語らう', 'ツラトゥストラ', 'DM24-BD6', 'DM24BD6'],
    packPrefix: 'DM24BD6',
  },
];

// === 2026年 DM26-SD1 ドキドキつよいデッキ 25の王道 (全25種) ===
const DM26SD1_NAMES = [
  ['a', '究極のヨビニオン！水闇自然マルルデッキ', ['アナマルル', 'マルルデッキ', '水闇自然マルル', 'ヨビニオンマルルデッキ']],
  ['b', '五文明がミラクルする5cザーディデッキ', ['5cザーディ', 'ザーディクリカデッキ', '五文明がミラクルする']],
  ['c', 'シールドゼロで鬼札逆転4c邪王門デッキ', ['4c邪王門', '邪王門デッキ']],
  ['d', '目指せ全開ガ・リュミーズ水魔導具デッキ', ['青魔導具', '水魔導具', 'ガリュミーズデッキ']],
  ['e', '呪文連打でコンボを目指せゴスペルデッキ', ['ラッカゴスペル', 'ゴスペルデッキ']],
  ['f', '相手の隙に一撃必殺！水闇手札破壊デッキ', ['青黒ハンデス', '水闇手札破壊', 'メアリージェニーデッキ']],
  ['g', '輝けボルシャック！火光アーマードデッキ', ['赤白アーマード', '火光アーマード']],
  ['h', 'ドラゴン娘の生徒会大集結ドラゴンデッキ', ['5cドラゴン娘', 'ドラゴン娘デッキ']],
  ['i', '芸術の3ターンキル！火水マジックデッキ', ['赤青マジック', '火水マジック', 'カクメイジンデッキ']],
  ['j', 'めくりに命をかけろ！8軸ガチロボデッキ', ['8軸ガチロボ', 'ガチロボデッキ']],
  ['k', 'エンドレスガチンコバトル！ハチ公デッキ', ['赤緑ハチ公', 'ハチ公デッキ']],
  ['l', '勝太のハンター＆カイザー「刃鬼」デッキ', ['シータ刃鬼', 'カイザー刃鬼デッキ', '刃鬼デッキ']],
  ['m', 'ウィンの革命チェンジ闇自然アビスデッキ', ['黒緑アビス', '闇自然アビス', 'アビスベル覇ロードデッキ']],
  ['n', 'ジョーの一撃必殺ジョーカーズデッキ', ['旅路ジョーカーズ', 'ジョーカーズデッキ']],
  ['o', 'タマシード戦略の火光水ライオネルデッキ', ['ラッカライオネル', '火光水ライオネル', 'ライオネルデッキ']],
  ['p', 'コンボで連鎖！自然単グランセクトデッキ', ['自然単グランセクト', 'ゲイルヴェスパーデッキ', 'グランセクトデッキ']],
  ['q', '地上戦は最強！水自然ジャイアントデッキ', ['青緑ジャイアント', '水自然ジャイアント', 'ジャイアントデッキ']],
  ['r', '勝舞の魂クロスせよ！火光サムライデッキ', ['赤白サムライ', '火光サムライ', 'サムライデッキ']],
  ['s', '相手を翻弄せよ！光闇メカ＆シノビデッキ', ['白黒メカ', '光闇メカ', 'メカシノビデッキ']],
  ['t', '元祖守りの王道！光自然巨大ゲートデッキ', ['光自然巨大ゲート', '元祖守りの王道']],
  ['u', 'ツインパクトの極み！光水自然清永デッキ', ['トリーヴァ清永', '光水自然清永', '清永デッキ']],
  ['v', '手札を無くせ！火自然ギャラクシーデッキ', ['赤緑ギャラクシー', '火自然ギャラクシー', '逆悪襲デッキ']],
  ['w', '敵は周回遅れ！火水闇レッドゾーンデッキ', ['クローシスバイク', '火水闇レッドゾーン', 'ブラックゾーンデッキ']],
  ['x', '墓地を増やせ！火闇自然墓地ソースデッキ', ['デアリ墓地ソース', '火闇自然墓地ソース', 'DOOMドラゲリオンデッキ']],
  ['y', '超進化！闇自然ケンジ・キングダムデッキ', ['黒緑ケンジ', '闇自然ケンジキングダム', 'ケンジキングダムデッキ']],
];

for (let i = 0; i < DM26SD1_NAMES.length; i++) {
  const [letter, title, extraAliases] = DM26SD1_NAMES[i];
  const num = String(i + 1).padStart(2, '0');
  MANUAL_DECKS.push({
    id: `DM26SD1-${letter}`,
    code: `DM26-SD1 (${num}/25)`,
    name: `ドキドキつよいデッキ25の王道 ${title}`,
    aliases: [title, ...extraAliases, `25の王道 ${title}`, `DM26-SD1 ${letter.toUpperCase()}`],
    idPrefix: `dm26sd1-${letter}`,
  });
}

// === 2022-2023年・DMBD・DMSD・DMD ===
const OTHER_NAMED_DECKS = [
  ['DM23SD1', 'DM23-SD1', 'スタートWINデッキ 竜軍・オブ・ボルシャック', ['竜軍オブボルシャック', '竜軍・オブ・ボルシャック']],
  ['DM23SD2', 'DM23-SD2', 'スタートWINデッキ 聖沌・クノイチ・チェンジ', ['聖沌クノイチチェンジ', '聖沌・クノイチ・チェンジ', 'クノイチチェンジ']],
  ['DM23SD3', 'DM23-SD3', 'スタートWINデッキ 革命・アメイジン・マジック', ['革命アメイジンマジック', '革命・アメイジン・マジック', 'アメイジンマジック']],
  ['DM23BD1', 'DM23-BD1', 'レジェンドスーパーデッキ 禁王創来', ['禁王創来', 'きんおうそうらい']],
  ['DM23BD2', 'DM23-BD2', '開発部セレクションデッキ 火闇邪王門', ['火闇邪王門', '赤黒邪王門', '開発部セレクション 火闇邪王門']],
  ['DM23BD3', 'DM23-BD3', '開発部セレクションデッキ 水闇自然ハンデス', ['水闇自然ハンデス', 'アナカラーハンデス', 'アナハン']],
  ['DM23BD4', 'DM23-BD4', 'エキサイティング・デュエパ・デッキ ドラドラドラゴン龍幻郷', ['ドラドラドラゴン龍幻郷']],
  ['DM23BD5', 'DM23-BD5', 'エキサイティング・デュエパ・デッキ 不敬なり！真邪眼騎士団', ['不敬なり真邪眼騎士団', '真邪眼騎士団']],
  ['DM23BD6', 'DM23-BD6', 'エキサイティング・デュエパ・デッキ 双極のアカシックZ計画', ['双極のアカシックZ計画', 'アカシックZ計画']],
  ['DM23BD7', 'DM23-BD7', 'エキサイティング・デュエパ・デッキ ネゴシエートの偽衒学者', ['ネゴシエートの偽衒学者']],
  ['DM22SD1', 'DM22-SD1', 'スタートWINデッキ 邪神・フロム・アビス', ['邪神フロムアビス', '邪神・フロム・アビス']],
  ['DM22BD1', 'DM22-BD1', 'レジェンドスーパーデッキ 龍覇爆炎', ['龍覇爆炎', 'りゅうはばくえん']],
  ['DM22BD2', 'DM22-BD2', '開発部セレクションデッキ 光水火鬼羅.Star', ['光水火鬼羅Star', 'ラッカ鬼羅スター', '鬼羅.Starデッキ']],
  ['DM22BD3', 'DM22-BD3', '開発部セレクションデッキ 7軸ガチロボ', ['7軸ガチロボ']],
  ['DMBD22', 'DMBD-22', 'クロニクル・ダークサイド・デッキ 「零誕」', ['零誕', 'ぜろたん']],
  ['DMBD21', 'DMBD-21', 'クロニクル・ダークサイド・デッキ 「終焉」', ['終焉', 'しゅうえん']],
  ['DMBD20', 'DMBD-20', '開発部セレクションデッキ 水闇魔導具', ['水闇魔導具', '青黒魔導具']],
  ['DMBD19', 'DMBD-19', '開発部セレクションデッキ 火水覇道', ['火水覇道', '赤青覇道']],
  ['DMBD18', 'DMBD-18', 'レジェンドスーパーデッキ 神歌繚嵐', ['神歌繚嵐', 'しんかりょうらん']],
  ['DMBD17', 'DMBD-17', '20th クロニクルデッキ 熱血!! アウトレイジ・ビクトリー', ['アウトレイジビクトリー', '熱血アウトレイジビクトリー']],
  ['DMBD16', 'DMBD-16', '20th クロニクルデッキ 決闘!! ボルシャック・デュエル', ['ボルシャックデュエル', '決闘ボルシャックデュエル']],
  ['DMBD15', 'DMBD-15', 'レジェンドスーパーデッキ 蒼龍革命', ['蒼龍革命', 'そうりゅうかくめい']],
  ['DMBD14', 'DMBD-14', 'クロニクル最終決戦デッキ 龍魂紅蓮譚', ['龍魂紅蓮譚', 'りゅうこんぐれんたん']],
  ['DMBD13', 'DMBD-13', 'クロニクル最終決戦デッキ 覚醒流星譚', ['覚醒流星譚', 'かくせいりゅうせいたん']],
  ['DMBD12', 'DMBD-12', 'ガチヤバ4！無限改造デッキセットDX!! ゼーロのドラゴンオーラ', ['ゼーロのドラゴンオーラ']],
  ['DMBD11', 'DMBD-11', 'ガチヤバ4！無限改造デッキセットDX!! ジョーのビッグバンGR', ['ジョーのビッグバンGR']],
  ['DMBD10', 'DMBD-10', 'アルティメット・クロニクル・デッキ 2019 SSS!! 侵略デッドディザスター', ['侵略デッドディザスター', 'デッドディザスター']],
  ['DMBD09', 'DMBD-09', 'アルティメット・クロニクル・デッキ 2019 必勝!! 闘将ブレードオーガ', ['闘将ブレードオーガ', 'ブレードオーガ']],
  ['DMBD06', 'DMBD-06', 'クロニクル・レガシー・デッキ2018 至高のゼニス頂神殿', ['至高のゼニス頂神殿', 'ゼニス頂神殿']],
  ['DMBD05', 'DMBD-05', 'クロニクル・レガシー・デッキ2018 究極のバルガ龍幻郷', ['究極のバルガ龍幻郷', 'バルガ龍幻郷']],
  ['DMBD02', 'DMBD-02', 'クロニクル・レガシー・デッキ 風雲!! 怒流牙忍法帖', ['怒流牙忍法帖']],
  ['DMBD01', 'DMBD-01', 'クロニクル・レガシー・デッキ アルカディアス鎮魂歌', ['アルカディアス鎮魂歌', 'アルカディアスレクイエム']],
  ['DMSD21', 'DMSD-21', 'キングマスタースタートデッキ アバクの鬼レクスターズ', ['アバクの鬼レクスターズ']],
  ['DMSD20', 'DMSD-20', 'キングマスタースタートデッキ ジョーのS-MAX進化', ['ジョーのS-MAX進化']],
  ['DMSD19', 'DMSD-19', 'キングマスタースタートデッキ ハイドのディスペクターN・EXT', ['ハイドのディスペクター']],
  ['DMSD18', 'DMSD-18', 'キングマスタースタートデッキ ジェンドルのディスペクター', ['ジェンドルのディスペクター']],
  ['DMSD17', 'DMSD-17', 'キングマスタースタートデッキ ジョーのスター進化', ['ジョーのスター進化']],
  ['DMSD16', 'DMSD-16', 'キングマスタースタートデッキ ゼーロJr.のムゲンクライム', ['ゼーロJrのムゲンクライム']],
  ['DMSD15', 'DMSD-15', 'キングマスタースタートデッキ 鬼札の鬼タイム', ['鬼札の鬼タイム']],
  ['DMSD14', 'DMSD-14', 'キングマスタースタートデッキ ジョーのキリフダッシュ', ['ジョーのキリフダッシュ']],
  ['DMSD13', 'DMSD-13', '超GRメガスタートデッキ ジョーの超ジョーカーズ旋風', ['ジョーの超ジョーカーズ旋風']],
  ['DMSD12', 'DMSD-12', '超GRスタートデッキ ゼーロのオレガ無月大乱闘', ['ゼーロのオレガ無月大乱闘']],
  ['DMSD11', 'DMSD-11', '超GRスタートデッキ キャップのWAVEガチャ・パラダイス', ['WAVEガチャパラダイス']],
  ['DMSD10', 'DMSD-10', '超GRスタートデッキ キラのギラミリオン・ギラクシー', ['ギラミリオンギラクシー']],
  ['DMSD09', 'DMSD-09', '超GRスタートデッキ キャップのオレガ・オーラ・デリート', ['オレガオーラデリート']],
  ['DMSD08', 'DMSD-08', '超GRスタートデッキ ジョーのガチャメカ・ワンダフォー', ['ガチャメカワンダフォー']],
  ['DMSD07', 'DMSD-07', '煌世の剣・Z炸裂・スタートデッキ', ['煌世の剣Z炸裂']],
  ['DMSD06', 'DMSD-06', 'ドルスザク・無月炸裂・スタートデッキ', ['ドルスザク無月炸裂']],
  ['DMSD05', 'DMSD-05', 'オウ禍武斗・マッハ炸裂・スタートデッキ', ['オウ禍武斗マッハ炸裂']],
  ['DMSD04', 'DMSD-04', 'ジョーカーズ・弾銃炸裂・スタートデッキ', ['ジョーカーズ弾銃炸裂']],
  ['DMSD03', 'DMSD-03', 'NEWヒーローデッキ ボルツのB・A・D', ['ボルツのBAD']],
  ['DMSD02', 'DMSD-02', 'NEWヒーローデッキ キラのラビリンス', ['キラのラビリンス']],
  ['DMSD01', 'DMSD-01', 'NEWヒーローデッキ ジョーのジョーカーズ', ['ジョーのジョーカーズ']],
  ['DMD35', 'DMD-35', 'DXデュエガチャデッキ 禁星の壊者 ドキンダム', ['禁星の壊者ドキンダム']],
  ['DMD34', 'DMD-34', 'DXデュエガチャデッキ 銀刃の勇者 ドギラゴン', ['銀刃の勇者ドギラゴン']],
  ['DMD33', 'DMD-33', 'マスターズ・クロニクル・デッキ 2016 終焉の悪魔神', ['終焉の悪魔神']],
  ['DMD32', 'DMD-32', 'マスターズ・クロニクル・デッキ 2016 聖霊王の創生', ['聖霊王の創生']],
  ['DMD31', 'DMD-31', 'フィールド・スタート・デッキ バサラの禁断', ['バサラの禁断']],
  ['DMD30', 'DMD-30', '革命スタート・デッキ ルシファーの時間停止', ['ルシファーの時間停止']],
  ['DMD29', 'DMD-29', '革命スタート・デッキ 勝太の疾風速攻', ['勝太の疾風速攻']],
  ['DMD28', 'DMD-28', 'カスタム変形デッキ 革命vs侵略 龍極の光文明', ['龍極の光文明']],
  ['DMD27', 'DMD-27', 'カスタム変形デッキ 革命vs侵略 爆熱の火文明', ['爆熱の火文明']],
  ['DMD26', 'DMD-26', 'マスターズ・クロニクル・デッキ サバイバー進化論 α to Ω', ['サバイバー進化論']],
  ['DMD25', 'DMD-25', 'マスターズ・クロニクル・デッキ ロマノフ煉獄からの復活', ['ロマノフ煉獄からの復活']],
  ['DMD24', 'DMD-24', 'マスターズ・クロニクル・デッキ ボルメテウス・リターンズ', ['ボルメテウスリターンズ']],
  ['DMD20', 'DMD-20', 'スーパーVデッキ 勝利の将龍剣ガイオウバーン', ['勝利の将龍剣ガイオウバーン']],
  ['DMD19', 'DMD-19', 'スーパーVデッキ 滅びの竜刃 ディアボロス', ['滅びの竜刃ディアボロス']],
  ['DMD18', 'DMD-18', 'スーパーVデッキ 燃えろ龍剣 ガイアール', ['燃えろ龍剣ガイアール']],
  ['DMD13', 'DMD-13', 'スーパーデッキMAX カツキングと伝説の秘宝', ['カツキングと伝説の秘宝']],
];

for (const [packPrefix, code, name, aliases] of OTHER_NAMED_DECKS) {
  MANUAL_DECKS.push({
    id: packPrefix,
    code,
    name,
    aliases: [name, code, packPrefix, ...aliases],
    packPrefix,
  });
}

// Build final deck list with resolved cards & counts
const finalDecks = [];
for (const d of MANUAL_DECKS) {
  const baseCards = getDeckBaseCards({ packPrefix: d.packPrefix, idPrefix: d.idPrefix });
  if (baseCards.length === 0) continue;
  const counts = d.counts || buildDefaultCounts(baseCards, baseCards.length >= 40 ? baseCards.length : 40);
  const cardsList = baseCards.map((c) => ({
    id: c.id,
    name: c.name,
    count: counts[c.id] || 1,
  }));
  const totalCards = cardsList.reduce((acc, cur) => acc + cur.count, 0);
  finalDecks.push({
    id: d.id,
    code: d.code,
    name: d.name,
    aliases: d.aliases,
    totalCards,
    uniqueCards: cardsList.length,
    cards: cardsList,
  });
}

const outPath = path.join(__dirname, '..', 'src', 'lib', 'preconstructedDecks.json');
fs.writeFileSync(outPath, JSON.stringify(finalDecks, null, 2), 'utf8');
console.log('Generated preconstructedDecks.json:', finalDecks.length, 'decks');
console.log('Sample DM25SD1:', finalDecks[0].name, finalDecks[0].uniqueCards, 'types,', finalDecks[0].totalCards, 'cards');
