'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Filter,
  Layers,
  LayoutGrid,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderKanban,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { getCivilizationColor } from '@/lib/civilization';
import { normalizeForSearch } from '@/lib/normalize';
import {
  RARITY_CATEGORIES,
  RARITY_GROUP_ORDER,
  getRarityRank,
  getRarityGroupTitle,
  matchesRarityFilter,
  getRarityBadgeStyle,
} from '@/lib/rarity';
import { StorageItem, InventoryItem } from '@/types';

interface InventoryViewProps {
  items: InventoryItem[];
  storages: StorageItem[];
  selectedStorageId: number | 'all';
  onUpdateCount: (id: number, newCount: number) => void;
  onDeleteItem: (id: number) => void;
  onSelectCardDetail?: (item: InventoryItem) => void;
}

type SortKey =
  | 'updated_desc'
  | 'cost_asc'
  | 'cost_desc'
  | 'rarity_desc'
  | 'rarity_asc'
  | 'type'
  | 'count_desc'
  | 'name_asc';
type GroupByKey = 'none' | 'type' | 'rarity' | 'cost' | 'civil';

export const CARD_TYPE_CATEGORIES = [
  { label: 'すべて', value: 'all' },
  { label: 'クリーチャー', value: 'クリーチャー' },
  { label: '進化クリーチャー', value: '進化クリーチャー' },
  { label: '呪文', value: '呪文' },
  { label: 'ツインパクト', value: 'ツインパクト' },
  { label: 'タマシード', value: 'タマシード' },
  { label: 'サイキック', value: 'サイキック' },
  { label: 'ドラグハート', value: 'ドラグハート' },
  { label: 'GR / オーラ', value: 'GR / オーラ' },
  { label: 'フィールド / 城 / ギア', value: 'フィールド / 城 / ギア' },
  { label: 'その他', value: 'その他' },
] as const;

const TYPE_GROUP_ORDER = [
  'クリーチャー',
  '進化クリーチャー',
  '呪文',
  'ツインパクト',
  'タマシード',
  'サイキック',
  'ドラグハート',
  'GR / オーラ',
  'フィールド / 城 / ギア',
  'その他',
];

/** カードの主たるカードタイプ分類を返す（グループ分け・並び替え用） */
export function getCardTypeCategory(name: string, type: string | null | undefined): string {
  const t = type || '';
  const n = name || '';
  if (n.includes(' / ') || n.includes('／')) return 'ツインパクト';
  if (t.includes('サイキック')) return 'サイキック';
  if (t.includes('ドラグハート')) return 'ドラグハート';
  if (t.includes('GR') || t.includes('オーラ')) return 'GR / オーラ';
  if (t.includes('進化')) return '進化クリーチャー';
  if (t.includes('タマシード')) return 'タマシード';
  if (t.includes('クリーチャー')) return 'クリーチャー';
  if (t.includes('呪文')) return '呪文';
  if (t.includes('フィールド') || t.includes('城') || t.includes('クロスギア')) {
    return 'フィールド / 城 / ギア';
  }
  return 'その他';
}

/** 選択されたカードタイプフィルターに一致するか判定（ツインパクトや裏面も考慮） */
export function matchesCardTypeFilter(
  filterVal: string,
  name: string,
  type: string | null | undefined,
  facesJson?: string | null
): boolean {
  if (filterVal === 'all') return true;
  const primary = getCardTypeCategory(name, type);
  if (primary === filterVal) return true;

  const allTypes = [type || ''];
  if (facesJson) {
    try {
      const faces = JSON.parse(facesJson);
      if (Array.isArray(faces)) {
        for (const f of faces) {
          if (f && f.type) allTypes.push(f.type);
        }
      }
    } catch {}
  }

  if (filterVal === 'クリーチャー') {
    return allTypes.some(
      (t) =>
        t.includes('クリーチャー') &&
        !t.includes('サイキック') &&
        !t.includes('ドラグハート') &&
        !t.includes('GR')
    );
  }
  if (filterVal === '進化クリーチャー') {
    return allTypes.some((t) => t.includes('進化'));
  }
  if (filterVal === '呪文') {
    return allTypes.some((t) => t.includes('呪文')) || name.includes(' / ') || name.includes('／');
  }
  if (filterVal === 'タマシード') {
    return allTypes.some((t) => t.includes('タマシード'));
  }
  if (filterVal === 'サイキック') {
    return allTypes.some((t) => t.includes('サイキック'));
  }
  if (filterVal === 'ドラグハート') {
    return allTypes.some((t) => t.includes('ドラグハート'));
  }
  if (filterVal === 'GR / オーラ') {
    return allTypes.some((t) => t.includes('GR') || t.includes('オーラ'));
  }
  if (filterVal === 'フィールド / 城 / ギア') {
    return allTypes.some((t) => t.includes('フィールド') || t.includes('城') || t.includes('クロスギア'));
  }
  return false;
}

export default function InventoryView({
  items,
  storages,
  selectedStorageId,
  onUpdateCount,
  onDeleteItem,
  onSelectCardDetail,
}: InventoryViewProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCivil, setSelectedCivil] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedCost, setSelectedCost] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('cost_asc');
  const [groupBy, setGroupBy] = useState<GroupByKey>('none');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const currentStorage = useMemo(() => {
    if (selectedStorageId === 'all') return null;
    return storages.find((s) => s.id === selectedStorageId);
  }, [selectedStorageId, storages]);

  const civilFilters = [
    { label: 'すべて', value: 'all' },
    { label: '火', value: '火' },
    { label: '水', value: '水' },
    { label: '自然', value: '自然' },
    { label: '光', value: '光' },
    { label: '闇', value: '闇' },
    { label: '多色', value: '多色' },
    { label: 'ゼロ', value: 'ゼロ' },
  ];

  const costFilters = [
    { label: 'すべて', value: 'all' },
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },
    { label: '10+', value: '10+' },
  ];

  // フィルタリング＆ソート処理
  const filteredAndSortedItems = useMemo(() => {
    const filtered = items.filter((item) => {
      // ストレージ絞り込み
      if (selectedStorageId !== 'all' && item.storage_id !== selectedStorageId) {
        return false;
      }

      // 文明絞り込み
      if (selectedCivil !== 'all') {
        if (selectedCivil === '多色') {
          if (!item.card_civil.includes('/') && item.card_civil.length <= 2) return false;
        } else {
          if (!item.card_civil.includes(selectedCivil)) return false;
        }
      }

      // カードタイプ絞り込み
      if (
        selectedType !== 'all' &&
        !matchesCardTypeFilter(selectedType, item.card_name, item.card_type, item.card_faces_json)
      ) {
        return false;
      }

      // レアリティ絞り込み
      if (selectedRarity !== 'all' && !matchesRarityFilter(selectedRarity, item.card_rarity)) {
        return false;
      }

      // コスト絞り込み
      if (selectedCost !== 'all') {
        if (item.card_cost === null || item.card_cost === undefined) return false;
        if (selectedCost === '10+') {
          if (item.card_cost < 10) return false;
        } else {
          if (item.card_cost !== parseInt(selectedCost, 10)) return false;
        }
      }

      // キーワード絞り込み（フリガナ・裏面・覚醒面の名前も対象）
      if (filterQuery.trim()) {
        const q = normalizeForSearch(filterQuery);
        const targets = [
          item.card_name,
          item.card_ruby,
          item.card_alt_names,
          item.card_faces_json,
          item.card_pack,
          item.card_race,
          item.card_type,
          item.card_id,
        ];
        if (!targets.some((t) => normalizeForSearch(t).includes(q))) return false;
      }

      return true;
    });

    // 並び替え
    return [...filtered].sort((a, b) => {
      if (sortBy === 'cost_asc') {
        const ca = a.card_cost ?? 9999;
        const cb = b.card_cost ?? 9999;
        if (ca !== cb) return ca - cb;
        return a.card_name.localeCompare(b.card_name, 'ja');
      }
      if (sortBy === 'cost_desc') {
        const ca = a.card_cost ?? -1;
        const cb = b.card_cost ?? -1;
        if (ca !== cb) return cb - ca;
        return a.card_name.localeCompare(b.card_name, 'ja');
      }
      if (sortBy === 'rarity_desc') {
        const ra = getRarityRank(a.card_rarity, a.card_pack);
        const rb = getRarityRank(b.card_rarity, b.card_pack);
        if (ra !== rb) return rb - ra;
        const ca = a.card_cost ?? 9999;
        const cb = b.card_cost ?? 9999;
        if (ca !== cb) return ca - cb;
        return a.card_name.localeCompare(b.card_name, 'ja');
      }
      if (sortBy === 'rarity_asc') {
        const ra = getRarityRank(a.card_rarity, a.card_pack);
        const rb = getRarityRank(b.card_rarity, b.card_pack);
        if (ra !== rb) return ra - rb;
        const ca = a.card_cost ?? 9999;
        const cb = b.card_cost ?? 9999;
        if (ca !== cb) return ca - cb;
        return a.card_name.localeCompare(b.card_name, 'ja');
      }
      if (sortBy === 'type') {
        const ta = TYPE_GROUP_ORDER.indexOf(getCardTypeCategory(a.card_name, a.card_type));
        const tb = TYPE_GROUP_ORDER.indexOf(getCardTypeCategory(b.card_name, b.card_type));
        if (ta !== tb) return ta - tb;
        const ca = a.card_cost ?? 9999;
        const cb = b.card_cost ?? 9999;
        if (ca !== cb) return ca - cb;
        return a.card_name.localeCompare(b.card_name, 'ja');
      }
      if (sortBy === 'count_desc') {
        if (b.count !== a.count) return b.count - a.count;
        const ca = a.card_cost ?? 9999;
        const cb = b.card_cost ?? 9999;
        return ca - cb;
      }
      if (sortBy === 'name_asc') {
        return a.card_name.localeCompare(b.card_name, 'ja');
      }
      // updated_desc
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });
  }, [items, selectedStorageId, selectedCivil, selectedType, selectedRarity, selectedCost, filterQuery, sortBy]);

  // グループ分け処理
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ title: '', items: filteredAndSortedItems }];
    }

    const map = new Map<string, InventoryItem[]>();

    for (const item of filteredAndSortedItems) {
      let key = '';
      if (groupBy === 'type') {
        key = getCardTypeCategory(item.card_name, item.card_type);
      } else if (groupBy === 'rarity') {
        key = getRarityGroupTitle(item.card_rarity);
      } else if (groupBy === 'cost') {
        key = item.card_cost !== null && item.card_cost !== undefined ? `コスト ${item.card_cost}` : 'コストなし';
      } else if (groupBy === 'civil') {
        if (!item.card_civil) key = '無色・ゼロ';
        else if (item.card_civil.includes('/')) key = `多色 (${item.card_civil})`;
        else key = `${item.card_civil}文明`;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    const entries = [...map.entries()].map(([title, groupItems]) => ({ title, items: groupItems }));

    if (groupBy === 'type') {
      entries.sort((a, b) => TYPE_GROUP_ORDER.indexOf(a.title) - TYPE_GROUP_ORDER.indexOf(b.title));
    } else if (groupBy === 'rarity') {
      entries.sort((a, b) => {
        const ia = RARITY_GROUP_ORDER.indexOf(a.title);
        const ib = RARITY_GROUP_ORDER.indexOf(b.title);
        return sortBy === 'rarity_asc' ? ib - ia : ia - ib;
      });
    } else if (groupBy === 'cost') {
      entries.sort((a, b) => {
        const na = a.title.startsWith('コスト ') ? parseInt(a.title.replace('コスト ', ''), 10) : 9999;
        const nb = b.title.startsWith('コスト ') ? parseInt(b.title.replace('コスト ', ''), 10) : 9999;
        return sortBy === 'cost_desc' ? nb - na : na - nb;
      });
    }

    return entries;
  }, [filteredAndSortedItems, groupBy, sortBy]);

  const totalFilteredCards = filteredAndSortedItems.reduce((acc, cur) => acc + cur.count, 0);
  const hasActiveFilters =
    selectedCivil !== 'all' ||
    selectedType !== 'all' ||
    selectedRarity !== 'all' ||
    selectedCost !== 'all' ||
    filterQuery.trim() !== '';

  const resetFilters = () => {
    setSelectedCivil('all');
    setSelectedType('all');
    setSelectedRarity('all');
    setSelectedCost('all');
    setFilterQuery('');
  };

  return (
    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
      {/* 上部ヘッダー & コントロール */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ backgroundColor: currentStorage?.color || '#3b82f6' }}
            />
            <h2 className="text-base font-bold text-white">
              {currentStorage ? currentStorage.name : 'すべての保管カード'}
            </h2>
            <span className="text-xs text-slate-400 font-medium bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
              合計 {totalFilteredCards}枚 ({filteredAndSortedItems.length}種類)
            </span>
          </div>
          {currentStorage?.memo && (
            <p className="text-xs text-slate-400 mt-1">{currentStorage.memo}</p>
          )}
        </div>

        {/* 検索・表示切り替え */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-48 sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="所持カード内を絞り込み..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="グリッド表示"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="リスト表示"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 並び替え（ソート）＆ グループ分けバー */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800/80">
        {/* 並び替えボタン群 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 font-medium">
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
            並び順:
          </span>
          <button
            onClick={() => setSortBy('cost_asc')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'cost_asc'
                ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            <ArrowUp className="w-3 h-3" />
            コストが小さい順
          </button>
          <button
            onClick={() => setSortBy('cost_desc')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'cost_desc'
                ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            <ArrowDown className="w-3 h-3" />
            コストが大きい順
          </button>
          <button
            onClick={() => setSortBy('rarity_desc')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'rarity_desc'
                ? 'bg-amber-600/30 border-amber-500 text-amber-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            レアリティが高い順
          </button>
          <button
            onClick={() => setSortBy('rarity_asc')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'rarity_asc'
                ? 'bg-amber-600/30 border-amber-500 text-amber-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            レアリティが低い順
          </button>
          <button
            onClick={() => setSortBy('type')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'type'
                ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            カードタイプ順
          </button>
          <button
            onClick={() => setSortBy('count_desc')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'count_desc'
                ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            枚数が多い順
          </button>
          <button
            onClick={() => setSortBy('name_asc')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'name_asc'
                ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            名前順
          </button>
          <button
            onClick={() => setSortBy('updated_desc')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
              sortBy === 'updated_desc'
                ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
          >
            追加順
          </button>
        </div>

        {/* グループ分け（見出し分け）切り替え */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 font-medium">
            <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
            グループ分け:
          </span>
          {(
            [
              { label: 'なし', value: 'none' },
              { label: 'レアリティ別', value: 'rarity' },
              { label: 'カードタイプ別', value: 'type' },
              { label: 'コスト別', value: 'cost' },
              { label: '文明別', value: 'civil' },
            ] as { label: string; value: GroupByKey }[]
          ).map((g) => (
            <button
              key={g.value}
              onClick={() => setGroupBy(g.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                groupBy === g.value
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-sm'
                  : 'bg-slate-800/70 border-slate-700/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* フィルター群（カードタイプ・コスト・文明） */}
      <div className="space-y-2.5 mb-4 pb-3 border-b border-slate-800/80">
        {/* カードタイプフィルター */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 shrink-0 font-medium">
            <Filter className="w-3 h-3 text-emerald-400" />
            タイプ:
          </span>
          {CARD_TYPE_CATEGORIES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedType(tf.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                selectedType === tf.value
                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* レアリティフィルター */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 shrink-0 font-medium">
            <Sparkles className="w-3 h-3 text-purple-400" />
            レア度:
          </span>
          {RARITY_CATEGORIES.map((rf) => (
            <button
              key={rf.value}
              onClick={() => setSelectedRarity(rf.value)}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                selectedRarity === rf.value
                  ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {rf.label}
            </button>
          ))}
        </div>

        {/* コストフィルター */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 shrink-0 font-medium">
            <Filter className="w-3 h-3 text-amber-400" />
            コスト:
          </span>
          {costFilters.map((cf) => (
            <button
              key={cf.value}
              onClick={() => setSelectedCost(cf.value)}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                selectedCost === cf.value
                  ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cf.label}
            </button>
          ))}
        </div>

        {/* 文明フィルター */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 shrink-0 font-medium">
              <Filter className="w-3 h-3 text-blue-400" />
              文明:
            </span>
            {civilFilters.map((cf) => (
              <button
                key={cf.value}
                onClick={() => setSelectedCivil(cf.value)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                  selectedCivil === cf.value
                    ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cf.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 shrink-0 transition"
            >
              <RotateCcw className="w-3 h-3" />
              条件をリセット
            </button>
          )}
        </div>
      </div>

      {/* カード一覧 */}
      {filteredAndSortedItems.length === 0 ? (
        <div className="py-20 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">条件に一致する保管カードがありません</p>
          <p className="text-xs text-slate-600 mt-1">
            上の検索バーからカードを検索してストレージに追加するか、絞り込み条件を変更してください
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSections.map((section) => {
            const sectionTotal = section.items.reduce((acc, cur) => acc + cur.count, 0);
            return (
              <div key={section.title || 'all'} className="space-y-3">
                {section.title && (
                  <div className="flex items-center justify-between bg-slate-800/70 border border-slate-700/80 rounded-xl px-3.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-4 rounded-full bg-indigo-500" />
                      <h3 className="text-xs font-bold text-white tracking-wide">{section.title}</h3>
                    </div>
                    <span className="text-[11px] text-slate-300 font-medium">
                      {sectionTotal}枚 ({section.items.length}種類)
                    </span>
                  </div>
                )}

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">
                    {section.items.map((item) => {
                      const colors = getCivilizationColor(item.card_civil);
                      const typeLabel = getCardTypeCategory(item.card_name, item.card_type);
                      return (
                        <div
                          key={item.id}
                          className={`group bg-slate-950/70 border ${colors.border} rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:border-blue-500/60 transition flex flex-col`}
                        >
                          {/* カード画像 */}
                          <div
                            className="relative aspect-[7/10] bg-slate-900 overflow-hidden cursor-pointer"
                            onClick={() => onSelectCardDetail && onSelectCardDetail(item)}
                          >
                            {item.card_image ? (
                              <img
                                src={item.card_image}
                                alt={item.card_name}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                                <span className="text-xs font-bold text-slate-400">{item.card_name}</span>
                                <span className="text-[10px] text-slate-600 mt-1 font-mono">{item.card_pack}</span>
                              </div>
                            )}

                            {/* 枚数バッジ (画像右上) */}
                            <div className="absolute top-2 right-2 bg-slate-950/90 border border-blue-500/80 text-white font-extrabold text-sm px-2.5 py-0.5 rounded-full shadow-lg">
                              ×{item.count}
                            </div>

                            {/* 文明バッジ (画像左上) */}
                            <div className="absolute top-2 left-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shadow-md ${colors.badge}`}>
                                {item.card_civil || '無色'}
                              </span>
                            </div>

                            {/* コストバッジ */}
                            {item.card_cost !== null && (
                              <div className="absolute bottom-2 left-2 bg-slate-950/90 border border-slate-700 text-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                                Cost {item.card_cost}
                              </div>
                            )}

                            {/* レアリティバッジ */}
                            {item.card_rarity && item.card_rarity !== '-' && (
                              <div
                                className={`absolute bottom-2 right-2 border text-[10px] font-bold px-1.5 py-0.5 rounded shadow ${
                                  getRarityBadgeStyle(item.card_rarity).className
                                }`}
                              >
                                {getRarityBadgeStyle(item.card_rarity).prefix}
                                {item.card_rarity}
                              </div>
                            )}
                          </div>

                          {/* カード情報 */}
                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="font-bold text-xs text-white truncate" title={item.card_name}>
                                {item.card_name}
                              </h3>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 gap-1">
                                <span className="font-mono text-indigo-400 truncate">{item.card_pack}</span>
                                <span className="px-1.5 py-0.2 bg-slate-800/90 border border-slate-700/70 text-emerald-300 rounded shrink-0">
                                  {typeLabel}
                                </span>
                              </div>

                              {/* ストレージ場所 */}
                              {selectedStorageId === 'all' && (
                                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: item.storage_color || '#3b82f6' }}
                                  />
                                  <span className="truncate">{item.storage_name}</span>
                                </div>
                              )}
                            </div>

                            {/* 枚数操作ボタン (+ / -) */}
                            <div className="flex items-center justify-between gap-1 pt-2.5 mt-2 border-t border-slate-800">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => onUpdateCount(item.id, item.count - 1)}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                  title="1枚減らす"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-bold text-xs w-6 text-center text-white">
                                  {item.count}
                                </span>
                                <button
                                  onClick={() => onUpdateCount(item.id, item.count + 1)}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                  title="1枚増やす"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                onClick={() => onDeleteItem(item.id)}
                                className="p-1 text-slate-500 hover:text-red-400 transition"
                                title="保管から削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* リストテーブル表示 */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3">カード名</th>
                          <th className="py-2.5 px-2">カードタイプ</th>
                          <th className="py-2.5 px-2">型番</th>
                          <th className="py-2.5 px-2">文明</th>
                          <th className="py-2.5 px-2">コスト</th>
                          <th className="py-2.5 px-2">レアリティ</th>
                          <th className="py-2.5 px-2">保管場所</th>
                          <th className="py-2.5 px-3 text-center">枚数</th>
                          <th className="py-2.5 px-2 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {section.items.map((item) => {
                          const colors = getCivilizationColor(item.card_civil);
                          return (
                            <tr key={item.id} className="hover:bg-slate-800/50 transition">
                              <td
                                className="py-2 px-3 font-semibold text-white flex items-center gap-2 cursor-pointer"
                                onClick={() => onSelectCardDetail && onSelectCardDetail(item)}
                              >
                                <div className="w-6 h-8 bg-slate-800 rounded overflow-hidden shrink-0">
                                  {item.card_image ? (
                                    <img
                                      src={item.card_image}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : null}
                                </div>
                                <span className="truncate max-w-xs">{item.card_name}</span>
                              </td>
                              <td className="py-2 px-2 text-emerald-300 text-[11px]">
                                {getCardTypeCategory(item.card_name, item.card_type)}
                              </td>
                              <td className="py-2 px-2 font-mono text-indigo-400">{item.card_pack}</td>
                              <td className="py-2 px-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors.badge}`}>
                                  {item.card_civil || '無色'}
                                </span>
                              </td>
                              <td className="py-2 px-2 font-bold text-slate-200">
                                {item.card_cost !== null ? item.card_cost : '-'}
                              </td>
                              <td className="py-2 px-2 text-purple-300 font-semibold">{item.card_rarity || '-'}</td>
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: item.storage_color || '#3b82f6' }}
                                  />
                                  <span className="truncate">{item.storage_name}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => onUpdateCount(item.id, item.count - 1)}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-bold w-6 text-center text-white">{item.count}</span>
                                  <button
                                    onClick={() => onUpdateCount(item.id, item.count + 1)}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right">
                                <button
                                  onClick={() => onDeleteItem(item.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
