const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'dm_cards.db'));

function fetchWiki(page) {
  return new Promise((resolve) => {
    https.get('https://dmwiki.net/' + encodeURIComponent(page), { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

function fetchOfficial(code) {
  return new Promise(resolve => {
    https.get('https://dm.takaratomy.co.jp/product/' + code + '/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const matches = [...data.matchAll(/<td>(\d+)枚<\/td>\s*<td>([^<]+)<\/td>/g)].map(m => ({
          count: parseInt(m[1], 10),
          name: m[2].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
        }));
        resolve(matches);
      });
    }).on('error', () => resolve([]));
  });
}

function norm(s) {
  return (s || '')
    .replace(/<|＜/g, '<')
    .replace(/>|＞/g, '>')
    .replace(/モ\uFFFD+ナルク|モルナルク/g, 'モルナルク')
    .replace(/バデ\uFFFD+ドラゴン|バディドラゴン|バディ・ドラゴン/g, 'バディドラゴン')
    .replace(/[\s\u3000\uff0f\/・「」『』〈〉\-－―]/g, '')
    .toLowerCase();
}

function matchCard(dbCards, cardName) {
  if (cardName.includes('バデ') || cardName.includes('バディ')) {
    const buddy = dbCards.find(c => c.id === 'dm23sd1-009');
    if (buddy) return buddy;
  }
  const cNorm = norm(cardName);
  let matched = dbCards.filter(c => norm(c.name) === cNorm);
  if (matched.length === 0) {
    matched = dbCards.filter(c => norm(c.name).includes(cNorm) || cNorm.includes(norm(c.name)));
  }
  if (matched.length > 1) {
    const nonSec = matched.filter(c => !c.id.includes('SEC') && !c.id.includes('-SP') && !c.id.includes('-BE'));
    if (nonSec.length > 0) matched = nonSec;
    const nonStar = matched.filter(c => !c.id.includes('STAR'));
    if (nonStar.length > 0) matched = nonStar;
    const nonF = matched.filter(c => !c.id.endsWith('F'));
    if (nonF.length > 0) matched = nonF;
  }
  return matched[0] || null;
}

async function run() {
  const deckRecipes = {};

  // 1. Official Takaratomy Deck Pages
  const officialDecks = [
    { id: 'DM22BD1', code: 'dm22bd1', name: '龍覇爆炎' },
    { id: 'DM23BD1', code: 'dm23bd1', name: '禁王創来' },
    { id: 'DM23BD2', code: 'dm23bd2', name: '火闇邪王門' },
    { id: 'DM23BD3', code: 'dm23bd3', name: '水闇自然ハンデス' },
    { id: 'DM22BD2', code: 'dm22bd2', name: '光水火鬼羅.Star' },
    { id: 'DM22BD3', code: 'dm22bd3', name: '7軸ガチロボ' },
    { id: 'DM23SD1', code: 'dm23sd1', name: '竜軍・オブ・ボルシャック' },
    { id: 'DM23SD2', code: 'dm23sd2', name: '聖沌・クノイチ・チェンジ' },
    { id: 'DM23SD3', code: 'dm23sd3', name: '革命・アメイジン・マジック' },
  ];

  for (const d of officialDecks) {
    const list = await fetchOfficial(d.code);
    const dbCards = db.prepare('SELECT id, name, pack, type FROM cards WHERE id LIKE ? OR pack LIKE ? ORDER BY id ASC')
      .all(d.id.toLowerCase() + '%', d.id + ' %');
    
    const recipe = {};
    let sum = 0;
    for (const item of list) {
      const card = matchCard(dbCards, item.name);
      if (card) {
        recipe[card.id] = item.count;
        sum += item.count;
      } else {
        console.error(`[UNMATCHED in ${d.id}]: ${item.name} (${item.count}枚)`);
      }
    }
    console.log(`[Official] ${d.id} (${d.name}): total=${sum}, unique=${Object.keys(recipe).length}`);
    deckRecipes[d.id] = recipe;
  }

  // 2. Additional well-defined manual recipes from dmwiki
  // DMBD-20 (水闇魔導具)
  deckRecipes['DMBD20'] = {
    'dmbd20-001': 4, // ガル・ラガンザーク
    'dmbd20-002': 1, // 卍 デ・スザーク 卍
    'dmbd20-003': 3, // 卍月 ガ・リュザーク 卍 / 卍・獄・殺
    'dmbd20-004': 2, // 絶望と反魂と滅殺の決断
    'dmbd20-005': 4, // 堕魔 ヴォガイガ
    'dmbd20-006': 4, // 堕魔 ドゥポイズ
    'dmbd20-007': 3, // 堕呪 エアヴォ
    'dmbd20-008': 4, // 堕魔 ドゥリンリ
    'dmbd20-009': 3, // 追憶人形ラビリピト
    'dmbd20-010': 4, // 堕呪 バレッドゥ
    'dmbd20-011': 4, // 堕呪 カージグリ
    'dmbd20-012': 4, // 堕魔 グリギャン
  };

  // DMBD-19 (火水覇道)
  deckRecipes['DMBD19'] = {
    'dmbd19-001': 1, // 切札勝太&カツキング ー熱血の物語ー
    'dmbd19-002': 1, // “轟轟轟”ブランド
    'dmbd19-003': 4, // 勝利龍装 クラッシュ“覇道”
    'dmbd19-004': 2, // ウマキン☆プロジェクト
    'dmbd19-005': 2, // 奇天烈 シャッフ
    'dmbd19-006': 4, // 伝説演者 カメヲロォル
    'dmbd19-007': 4, // 終末の時計 ザ・クロック
    'dmbd19-008': 4, // “必駆”蛮触礼亞
    'dmbd19-009': 4, // Disノメノン
    'dmbd19-010': 4, // ドンドン火噴くナウ
    'dmbd19-011': 4, // 異端流し オニカマス
    'dmbd19-012': 1, // サイバー・ブレイン
    'dmbd19-013': 1, // 海底鬼面城
    'dmbd19-014': 4, // 龍装者 バルチュリス
  };

  // DM22SD1 (スタートWINデッキ 邪神・フロム・アビス)
  deckRecipes['DM22SD1'] = {
    'dm22sd1-001': 2, // 深淵の支配者 ジャシン
    'dm22sd1-002': 1, // カップ=ギャラップ
    'dm22sd1-003': 3, // テブル=ザザーム
    'dm22sd1-004': 4, // ハンマ＝ダンマ
    'dm22sd1-005': 4, // ベル＝ゲルエール
    'dm22sd1-006': 4, // スーパー・デーモン・ハンド
    'dm22sd1-007': 2, // ナイフ＝アライフ
    'dm22sd1-008': 3, // ルドルフ・カルナック
    'dm22sd1-009': 2, // 学校男
    'dm22sd1-010': 2, // フォーク＝フォック
    'dm22sd1-011': 3, // 魔薬医 ヘモグロ
    'dm22sd1-012': 4, // 特攻人形ジェニー
    'dm22sd1-013': 2, // 深淵の食卓
    'dm22sd1-014': 4, // オタカラ・アッタカラ
  };

  // DMBD-15 (レジェンドスーパーデッキ 蒼龍革命)
  deckRecipes['DMBD15'] = {
    'dmbd15-001': 3, // 蒼き守護神 ドギラゴン閃
    'dmbd15-002': 1, // 蒼き団長 ドギラゴン剣
    'dmbd15-003': 3, // ボルシャック・サイバーエクス
    'dmbd15-004': 2, // ボルシャック・ドギラゴン
    'dmbd15-005': 1, // エクス・リボルバー・ドラゴン
    'dmbd15-006': 1, // 守護炎龍 レヴィヤ・ターン
    'dmbd15-007': 3, // 凰翔竜機バルキリー・ルピア
    'dmbd15-008': 4, // “龍装”チュリス
    'dmbd15-009': 2, // 龍装者 バルチュリス
    'dmbd15-010': 3, // 聖霊龍騎サンブレード・NEX
    'dmbd15-011': 4, // エヴォ・ルピア
    'dmbd15-012': 4, // チャラ・ルピア
    'dmbd15-013': 2, // 鳳翔竜騎ソウルピアレイジ / 高貴なる魂炎
    'dmbd15-014': 1, // 単騎連射 マグナム
    'dmbd15-015': 1, // プラチナ・ワルスラS
    'dmbd15-016': 2, // 異端流し オニカマス
    'dmbd15-017': 2, // 終末の時計 ザ・クロック
    'dmbd15-018': 1, // 光牙忍ハヤブサマル
  };

  // DMBD-14 (クロニクル最終決戦デッキ 龍魂紅蓮譚)
  deckRecipes['DMBD14'] = {
    'dmbd14-001': 1, // 覇闘将龍剣 ガイオウバーン
    'dmbd14-002': 1, // 銀河大剣 ガイハート
    'dmbd14-003': 1, // 将龍剣 ガイアール
    'dmbd14-004': 1, // 無敵剣 プロト・ギガハート
    'dmbd14-005': 4, // 最終龍覇 グレンモルト
    'dmbd14-006': 3, // 爆龍覇 ヒビキ
    'dmbd14-007': 4, // 龍覇 グレンモルト
    'dmbd14-008': 4, // 二刀龍覇 グレンモルト「王」
    'dmbd14-009': 2, // 超戦龍覇 モルトNEXT
    'dmbd14-010': 2, // 永遠のリュウセイ・カイザー
    'dmbd14-011': 4, // 龍覇陣 グレン・エントリー
    'dmbd14-012': 2, // 熱血龍 バトクロス・バトル
    'dmbd14-013': 4, // スクランブル・チェンジ
    'dmbd14-014': 4, // ボルシャック・ドラゴン / 決闘者・チャージャー
    'dmbd14-015': 4, // メンデルスゾーン
    'dmbd14-016': 3, // コッコ・ルピア
  };

  // DMBD-13 (クロニクル最終決戦デッキ 覚醒流星譚)
  deckRecipes['DMBD13'] = {
    'dmbd13-001': 1, // 勝利のガイアール・カイザー
    'dmbd13-002': 1, // 勝利のリュウセイ・カイザー
    'dmbd13-003': 1, // 勝利のプリンプリン
    'dmbd13-004': 1, // 時空の雷龍チャクラ
    'dmbd13-005': 4, // 死海竜 ガロウズ・デビルドラゴン
    'dmbd13-006': 4, // 姫様宣言プリンプリン
    'dmbd13-007': 3, // メテオ・シャワー・ポッド
    'dmbd13-008': 3, // 不敗のダイハード・リュウセイ
    'dmbd13-009': 4, // リュウセイ・ジ・アース
    'dmbd13-010': 4, // 超次元リュウセイ・ホール
    'dmbd13-011': 4, // ドンドン吸い込むナウ
    'dmbd13-012': 4, // フェアリー・火の子祭
    'dmbd13-013': 4, // フェアリー・ライフ
    'dmbd13-014': 2, // サイバー・N・ワールド
  };

  // DMBD-10 (アルティメット・クロニクル・デッキ 2019 SSS!! 侵略デッドディザスター)
  deckRecipes['DMBD10'] = {
    'dmbd10-001': 3, // SSS級天災 デッドダムド
    'dmbd10-002': 2, // 虹速 ザ・ヴェルデ
    'dmbd10-003': 3, // 天災 デドダム
    'dmbd10-004': 3, // 禁断機関 VV-8
    'dmbd10-005': 3, // 復讐 ブラックサイコ
    'dmbd10-006': 2, // 超次元サプライズ・ホール
    'dmbd10-007': 3, // 奇天烈 シャッフ
    'dmbd10-008': 2, // Dの博才 サイバーダイス・ベガス
    'dmbd10-009': 4, // フェアリー・ライフ
    'dmbd10-010': 3, // 父なる大地
    'dmbd10-011': 2, // ハヤブサリュウ
    'dmbd10-012': 3, // 無修羅デジルムカデ
    'dmbd10-013': 3, // 追憶人形ラビリピト
    'dmbd10-014': 4, // 特攻人形ジェニー
  };

  // Verify all recipes
  for (const [id, rec] of Object.entries(deckRecipes)) {
    let sum = 0;
    for (const [cardId, count] of Object.entries(rec)) {
      sum += count;
      const card = db.prepare('SELECT id, name FROM cards WHERE id = ?').get(cardId);
      if (!card) console.error(`[DB ERROR in ${id}]: Card ${cardId} not found!`);
    }
    console.log(`[VERIFIED] ${id}: total=${sum}, unique=${Object.keys(rec).length}`);
  }

  fs.writeFileSync('scripts/major_deck_recipes.json', JSON.stringify(deckRecipes, null, 2), 'utf8');
}

run();
