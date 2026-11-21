import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeForSearch } from '@/lib/normalize';

interface CardRow {
  id: string;
  name: string;
  name_ruby: string | null;
  pack: string;
  type: string;
  civil: string;
  rarity: string;
  cost: number | null;
  power: string;
  race: string;
  image: string;
  alt_names: string | null;
  faces_json: string | null;
  ability_text: string | null;
}

function buildCivilSqlCondition(civilName: string, params: (string | number)[]): string {
  if (civilName === 'ゼロ') {
    return "(civil LIKE '%ゼロ%' OR civil LIKE '%無色%' OR civil = '' OR civil IS NULL)";
  }
  params.push(`%${civilName}%`);
  return 'civil LIKE ?';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = normalizeForSearch(searchParams.get('q'));
    const civilRaw = searchParams.get('civil')?.trim() || '';
    const civilMode = (searchParams.get('civilMode')?.trim() || 'or') as 'or' | 'and' | 'mono' | 'multi';
    const costRaw = searchParams.get('cost')?.trim() || '';
    const cardType = searchParams.get('type')?.trim() || '';
    const effectRaw = searchParams.get('effect')?.trim() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '60', 10), 400);

    const db = getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // 表面・裏面（覚醒面）・型番・ID・種族のすべてを対象に検索
    if (q) {
      conditions.push('search_key LIKE ?');
      params.push(`%${q}%`);
    }

    // 単色 / 多色フィルター
    if (civilMode === 'mono') {
      conditions.push("(civil NOT LIKE '%/%' AND length(COALESCE(civil, '')) <= 2)");
    } else if (civilMode === 'multi') {
      conditions.push("(civil LIKE '%/%' OR length(COALESCE(civil, '')) > 2)");
    }

    // 文明リスト絞り込み（カンマ区切り対応）
    if (civilRaw && civilRaw !== 'all') {
      const civils = civilRaw.split(',').map((c) => c.trim()).filter(Boolean);
      if (civils.length > 0) {
        if (civilMode === 'and') {
          for (const c of civils) {
            conditions.push(buildCivilSqlCondition(c, params));
          }
        } else {
          const orConds = civils.map((c) => buildCivilSqlCondition(c, params));
          conditions.push(`(${orConds.join(' OR ')})`);
        }
      }
    }

    // コスト絞り込み（カンマ区切り複数選択 & 10+ 対応）
    if (costRaw && costRaw !== 'all') {
      const costTokens = costRaw.split(',').map((c) => c.trim()).filter(Boolean);
      const costConds: string[] = [];
      for (const ct of costTokens) {
        if (ct === '10+' || ct === '10以上') {
          costConds.push('cost >= 10');
        } else {
          const n = parseInt(ct, 10);
          if (!isNaN(n)) {
            costConds.push('cost = ?');
            params.push(n);
          }
        }
      }
      if (costConds.length > 0) {
        conditions.push(`(${costConds.join(' OR ')})`);
      }
    }

    // カード種類絞り込み
    if (cardType && cardType !== 'all') {
      if (cardType === 'ツインパクト') {
        conditions.push("(name LIKE '% / %' OR name LIKE '%／%' OR type LIKE '%ツインパクト%')");
      } else if (cardType === '進化クリーチャー') {
        conditions.push("(type LIKE '%進化%' OR faces_json LIKE '%進化%')");
      } else if (cardType === '呪文') {
        conditions.push("(type LIKE '%呪文%' OR name LIKE '% / %' OR name LIKE '%／%' OR faces_json LIKE '%呪文%')");
      } else if (cardType === 'GR / オーラ') {
        conditions.push("(type LIKE '%GR%' OR type LIKE '%オーラ%' OR faces_json LIKE '%GR%' OR faces_json LIKE '%オーラ%')");
      } else if (cardType === 'フィールド / 城 / ギア') {
        conditions.push("(type LIKE '%フィールド%' OR type LIKE '%城%' OR type LIKE '%ギア%')");
      } else if (cardType === 'クリーチャー') {
        conditions.push(
          "((type LIKE '%クリーチャー%' OR faces_json LIKE '%クリーチャー%') AND type NOT LIKE '%進化%' AND type NOT LIKE '%サイキック%' AND type NOT LIKE '%ドラグハート%')"
        );
      } else {
        conditions.push('(type LIKE ? OR faces_json LIKE ?)');
        params.push(`%${cardType}%`, `%${cardType}%`);
      }
    }

    // 効果・特殊能力キーワード検索（空白・カンマ区切り AND 検索、表記ゆれ正規化）
    if (effectRaw) {
      const tokens = effectRaw
        .split(/[\s,、　]+/)
        .map((t) => normalizeForSearch(t))
        .filter(Boolean);
      for (const tok of tokens) {
        conditions.push("norm_effect(ability_text) LIKE ?");
        params.push(`%${tok}%`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // search_key は |表面名|裏面名|...|型番|ID|種族| 形式
    // 1: いずれかの面の名前と完全一致 / 2: いずれかの面の名前・型番に前方一致 / 3: 部分一致
    const query = `
      SELECT id, name, name_ruby, pack, type, civil, rarity, cost, power, race, image, alt_names, faces_json, ability_text
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

    const sortParams = q ? [`%|${q}|%`, `%|${q}%`] : ['', ''];
    const rows = db.prepare(query).all(...params, ...sortParams, limit) as CardRow[];

    const cards = rows.map(({ faces_json, ...rest }) => ({
      ...rest,
      faces: faces_json ? JSON.parse(faces_json) : [],
    }));

    return NextResponse.json({ cards });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
