const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'dm_cards.db'));
const currentRecipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'major_deck_recipes.json'), 'utf8'));

function fetchWiki(page) {
  return new Promise((resolve) => {
    https.get('https://dmwiki.net/' + encodeURIComponent(page), { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

function norm(s) {
  return (s || '')
    .replace(/[：:]/g, '')
    .replace(/[！!]/g, '')
    .replace(/[？?]/g, '')
    .replace(/[〜～~]/g, '')
    .replace(/[ー－―\-–]/g, '')
    .replace(/[<|＜]/g, '')
    .replace(/[>|＞]/g, '')
    .replace(/[\s\u3000\uff0f\/・「」『』〈〉()（）]/g, '')
    .toLowerCase();
}

function matchCard(dbCards, cardName) {
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

async function addWikiDecks() {
  const targets = [
    { id: 'DMBD18', page: 'DMBD-18' },
    { id: 'DMBD17', page: 'DMBD-17' },
    { id: 'DMBD16', page: 'DMBD-16' },
    { id: 'DMBD09', page: 'DMBD-09' },
    { id: 'DMBD06', page: 'DMBD-06' },
    { id: 'DMBD05', page: 'DMBD-05' },
    { id: 'DMSD21', page: 'DMSD-21' },
    { id: 'DMSD20', page: 'DMSD-20' },
    { id: 'DMSD19', page: 'DMSD-19' },
    { id: 'DMSD18', page: 'DMSD-18' },
    { id: 'DMSD17', page: 'DMSD-17' },
    { id: 'DMSD16', page: 'DMSD-16' },
    { id: 'DMSD15', page: 'DMSD-15' },
    { id: 'DMSD14', page: 'DMSD-14' },
  ];

  for (const t of targets) {
    const html = await fetchWiki(t.page);
    const idx = html.indexOf('収録カード');
    if (idx === -1) {
      console.warn('No cards for', t.id);
      continue;
    }
    const sub = html.substring(idx, idx + 12000).replace(/<[^>]+>/g, ' ');
    const matches = [...sub.matchAll(/《([^》]+)》\s*(\d+)/g)];
    const dbCards = db.prepare('SELECT id, name, pack FROM cards WHERE id LIKE ? OR pack LIKE ? ORDER BY id ASC')
      .all(t.id.toLowerCase() + '%', t.id + ' %');
    
    const recipe = {};
    let sum = 0;
    for (const m of matches) {
      const cardName = m[1].trim();
      const count = parseInt(m[2], 10);
      const card = matchCard(dbCards, cardName);
      if (card) {
        recipe[card.id] = count;
        sum += count;
      } else {
        console.warn(`[${t.id}] Unmatched: ${cardName} (${count}枚)`);
      }
    }
    const expected = matches.reduce((a, b) => a + parseInt(b[2], 10), 0);
    console.log(`[Wiki] ${t.id}: total=${sum}/${expected}, unique=${Object.keys(recipe).length}/${matches.length}`);
    if (sum === 40 || (expected > 0 && sum === expected)) {
      currentRecipes[t.id] = recipe;
    }
  }

  fs.writeFileSync(path.join(__dirname, 'major_deck_recipes.json'), JSON.stringify(currentRecipes, null, 2), 'utf8');
  console.log('Saved! Total decks in major_deck_recipes.json:', Object.keys(currentRecipes).length);
}

addWikiDecks();
