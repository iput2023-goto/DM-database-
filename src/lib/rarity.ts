export const RARITY_CATEGORIES = [
  { label: 'すべて', value: 'all' },
  { label: '👑 最高レア (OR/DMR/MAS/LEG/VIC)', value: 'HIGH' },
  { label: '★ SR', value: 'SR' },
  { label: '◆ VR', value: 'VR' },
  { label: '● R', value: 'R' },
  { label: '▲ U', value: 'U' },
  { label: '■ C', value: 'C' },
  { label: 'その他・プロモ', value: 'OTHER' },
] as const;

export const RARITY_GROUP_ORDER = [
  '👑 最高レア (OR/DMR/MAS/LEG/VIC)',
  '★ SR (スーパーレア)',
  '◆ VR (ベリーレア)',
  '● R (レア)',
  '▲ U (アンコモン)',
  '■ C (コモン)',
  'その他・プロモ',
];

const HIGH_RARITIES = new Set([
  'DMR',
  'OR',
  'KGM',
  'MAS',
  'MDG',
  'MDS',
  'MSS',
  'MSZ',
  'MHZ',
  'DG',
  'LEG',
  'WVC',
  'VIC',
  'DSR',
  'KGR',
  'SPR',
]);

/** レアリティの数値スコア（高いほど高レアリティ） */
export function getRarityRank(rarity: string | null | undefined, pack?: string | null): number {
  const r = (rarity || '').trim().toUpperCase();
  let base = 10;
  switch (r) {
    case 'DMR':
      base = 110;
      break;
    case 'OR':
      base = 105;
      break;
    case 'KGM':
      base = 100;
      break;
    case 'MAS':
    case 'MDG':
    case 'MDS':
    case 'MSS':
    case 'MSZ':
    case 'MHZ':
    case 'DG':
      base = 95;
      break;
    case 'LEG':
      base = 90;
      break;
    case 'WVC':
      base = 88;
      break;
    case 'VIC':
      base = 85;
      break;
    case 'DSR':
    case 'KGR':
      base = 82;
      break;
    case 'SPR':
      base = 78;
      break;
    case 'SR':
      base = 70;
      break;
    case 'VR':
      base = 60;
      break;
    case 'R':
      base = 50;
      break;
    case 'U':
      base = 40;
      break;
    case 'C':
      base = 30;
      break;
    default:
      base = 10;
      break;
  }

  // 型番に含まれるシークレット・トレジャー等の特別仕様ボーナス
  const p = pack || '';
  if ((p.includes('㊙') || p.includes('秘')) && p.includes('超')) {
    base += 4;
  } else if (/\bSP\d+\/SP\d+/i.test(p)) {
    base += 3.5;
  } else if (p.includes('㊙') || p.includes('秘')) {
    base += 3;
  } else if (/\b(TD|TR|TF)\d+\//i.test(p)) {
    base += 2;
  } else if (p.includes('超') || /\bG\d+\/G\d+/i.test(p)) {
    base += 1;
  }

  return base;
}

/** グループ分け用のレアリティ分類名を返す */
export function getRarityGroupTitle(rarity: string | null | undefined): string {
  const r = (rarity || '').trim().toUpperCase();
  if (HIGH_RARITIES.has(r)) return '👑 最高レア (OR/DMR/MAS/LEG/VIC)';
  if (r === 'SR') return '★ SR (スーパーレア)';
  if (r === 'VR') return '◆ VR (ベリーレア)';
  if (r === 'R') return '● R (レア)';
  if (r === 'U') return '▲ U (アンコモン)';
  if (r === 'C') return '■ C (コモン)';
  return 'その他・プロモ';
}

/** レアリティフィルターに一致するか判定 */
export function matchesRarityFilter(filterVal: string, rarity: string | null | undefined): boolean {
  if (filterVal === 'all') return true;
  const r = (rarity || '').trim().toUpperCase();
  if (filterVal === 'HIGH') return HIGH_RARITIES.has(r);
  if (filterVal === 'OTHER') return !r || r === '-' || (!HIGH_RARITIES.has(r) && !['SR', 'VR', 'R', 'U', 'C'].includes(r));
  return r === filterVal;
}

/** レアリティに応じたバッジスタイルとアイコン文字を返す */
export function getRarityBadgeStyle(rarity: string | null | undefined): {
  className: string;
  prefix: string;
} {
  const r = (rarity || '').trim().toUpperCase();
  if (HIGH_RARITIES.has(r)) {
    return {
      className:
        'bg-gradient-to-r from-amber-500/90 via-rose-500/90 to-purple-600/90 border-amber-300 text-white shadow-amber-500/30',
      prefix: '👑 ',
    };
  }
  if (r === 'SR') {
    return {
      className: 'bg-amber-950/95 border-amber-500/90 text-amber-200 shadow-amber-500/20',
      prefix: '★ ',
    };
  }
  if (r === 'VR') {
    return {
      className: 'bg-purple-950/95 border-purple-500/90 text-purple-200',
      prefix: '◆ ',
    };
  }
  if (r === 'R') {
    return {
      className: 'bg-sky-950/95 border-sky-600/80 text-sky-200',
      prefix: '● ',
    };
  }
  if (r === 'U') {
    return {
      className: 'bg-emerald-950/90 border-emerald-700/70 text-emerald-300',
      prefix: '',
    };
  }
  if (r === 'C') {
    return {
      className: 'bg-slate-900/90 border-slate-700 text-slate-300',
      prefix: '',
    };
  }
  return {
    className: 'bg-slate-900/90 border-slate-700 text-slate-400',
    prefix: '',
  };
}

