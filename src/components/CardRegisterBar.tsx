'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Check, Box, Loader2, X, ArrowUp, ArrowDown, Sparkles, Maximize2 } from 'lucide-react';
import { getCivilizationColor } from '@/lib/civilization';
import { normalizeForSearch } from '@/lib/normalize';
import { getRarityRank, getRarityBadgeStyle } from '@/lib/rarity';
import { StorageItem, CardMaster, CardFace } from '@/types';
import { CARD_TYPE_CATEGORIES, matchesCardTypeFilter } from './InventoryView';

/** 検索語が表面ではなく裏面（覚醒面など）の名前・フリガナに一致した場合、その面を返す */
function findBackFaceHit(card: CardMaster, query: string): CardFace | null {
  const nq = normalizeForSearch(query);
  if (!nq || normalizeForSearch(card.name).includes(nq) || normalizeForSearch(card.name_ruby).includes(nq)) {
    return null;
  }
  return (
    (card.faces || [])
      .slice(1)
      .find(
        (f) =>
          f.name !== card.name &&
          (normalizeForSearch(f.name).includes(nq) || normalizeForSearch(f.ruby).includes(nq))
      ) || null
  );
}

/** 大画面検索結果モーダル用のカードタイルコンポーネント */
interface BigCardResultTileProps {
  card: CardMaster;
  query: string;
  count: number;
  recentCount: number;
  isAdding: boolean;
  onAdd: (card: CardMaster, addCount: number) => void;
}

function BigCardResultTile({
  card,
  query,
  count,
  recentCount,
  isAdding,
  onAdd,
}: BigCardResultTileProps) {
  const [faceIndex, setFaceIndex] = useState(0);
  const faces =
    card.faces && card.faces.length > 0
      ? card.faces
      : [
          {
            name: card.name,
            ruby: card.name_ruby || undefined,
            pack: card.pack,
            type: card.type,
            civil: card.civil,
            rarity: card.rarity,
            cost: card.cost,
            power: card.power,
            race: card.race,
            image: card.image,
          },
        ];

  const currentFace = faces[Math.min(faceIndex, Math.max(faces.length - 1, 0))];
  const colors = getCivilizationColor(currentFace.civil || card.civil);
  const rarityBadge = getRarityBadgeStyle(currentFace.rarity || card.rarity);

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl p-3 flex flex-col justify-between transition-all shadow-lg hover:shadow-2xl relative group">
      <div>
        {/* 画像エリア */}
        <div className="relative aspect-[7/10] w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-700 mb-2.5">
          {currentFace.image ? (
            <img
              src={currentFace.image}
              alt={currentFace.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
              画像なし
            </div>
          )}

          {/* コスト */}
          {currentFace.cost !== null && currentFace.cost !== undefined && (
            <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-slate-900/90 backdrop-blur border border-slate-700 text-white rounded-md text-xs font-bold shadow">
              {currentFace.cost}
            </span>
          )}

          {/* 文明 */}
          <span
            className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold shadow ${colors.badge}`}
          >
            {currentFace.civil || '無色'}
          </span>

          {/* レアリティ */}
          {card.rarity && card.rarity !== '-' && (
            <span
              className={`absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0.5 border rounded font-bold shadow bg-slate-900/90 ${rarityBadge.className}`}
            >
              {rarityBadge.prefix}
              {card.rarity}
            </span>
          )}

          {/* 追加済みオーバーレイ */}
          {recentCount > 0 && (
            <div className="absolute inset-x-0 bottom-0 py-1 bg-emerald-600/95 backdrop-blur text-white font-bold text-center text-xs animate-fade-in shadow">
              ✓ 保管中 (+{recentCount}枚)
            </div>
          )}
        </div>

        {/* 両面切り替え（裏面・覚醒面・ツインパクト） */}
        {faces.length > 1 && (
          <div className="flex items-center justify-center gap-1 mb-2">
            {faces.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setFaceIndex(i)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                  i === faceIndex
                    ? 'bg-amber-500/25 border-amber-500 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {i === 0 ? '表面' : faces.length > 2 ? `裏${i}` : '裏面'}
              </button>
            ))}
          </div>
        )}

        {/* テキスト情報 */}
        <div className="space-y-0.5 mb-2.5">
          {currentFace.ruby && (
            <div className="text-[10px] text-sky-300/80 truncate leading-tight">
              {currentFace.ruby}
            </div>
          )}
          <h4
            className="font-bold text-xs text-white line-clamp-2 leading-snug"
            title={currentFace.name}
          >
            {currentFace.name}
          </h4>
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 font-mono">
            <span className="truncate">{card.pack}</span>
            {currentFace.type && (
              <span className="shrink-0 text-slate-500 ml-1">{currentFace.type}</span>
            )}
          </div>
        </div>
      </div>

      {/* 追加ボタン群 */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-700/60">
        <button
          type="button"
          disabled={isAdding}
          onClick={() => onAdd(card, count || 1)}
          className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow disabled:opacity-50"
          title={`設定枚数（${count || 1}枚）で追加`}
        >
          {isAdding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>+{count || 1}枚</span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={isAdding}
          onClick={() => onAdd(card, 4)}
          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
          title="4枚（1セット）一括追加"
        >
          +4
        </button>
      </div>
    </div>
  );
}

interface CardRegisterBarProps {
  storages: StorageItem[];
  selectedStorageId: number | 'all';
  onCardAdded: () => void;
}

export default function CardRegisterBar({
  storages,
  selectedStorageId,
  onCardAdded,
}: CardRegisterBarProps) {
  const [targetStorageId, setTargetStorageId] = useState<number>(
    typeof selectedStorageId === 'number' ? selectedStorageId : storages[0]?.id || 1
  );

  // 選択中ストレージが変わったら反映
  useEffect(() => {
    if (typeof selectedStorageId === 'number') {
      setTargetStorageId(selectedStorageId);
    } else if (storages.length > 0 && !storages.some(s => s.id === targetStorageId)) {
      setTargetStorageId(storages[0].id);
    }
  }, [selectedStorageId, storages]);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CardMaster[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardMaster | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownSort, setDropdownSort] = useState<'relevance' | 'cost_asc' | 'cost_desc' | 'rarity_desc'>('relevance');
  const [dropdownTypeFilter, setDropdownTypeFilter] = useState<string>('all');

  const displaySuggestions = useMemo(() => {
    const filtered = suggestions.filter((c) =>
      matchesCardTypeFilter(dropdownTypeFilter, c.name, c.type, JSON.stringify(c.faces || []))
    );
    if (dropdownSort === 'cost_asc') {
      return [...filtered].sort((a, b) => (a.cost ?? 9999) - (b.cost ?? 9999));
    }
    if (dropdownSort === 'cost_desc') {
      return [...filtered].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1));
    }
    if (dropdownSort === 'rarity_desc') {
      return [...filtered].sort((a, b) => getRarityRank(b.rarity, b.pack) - getRarityRank(a.rarity, a.pack));
    }
    return filtered;
  }, [suggestions, dropdownSort, dropdownTypeFilter]);

  // 枚数・状態
  const [count, setCount] = useState<number>(1);
  const [condition, setCondition] = useState<string>('プレイ用');
  const [memo, setMemo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [recentAddedMap, setRecentAddedMap] = useState<{ [cardId: string]: number }>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [showBigResultsModal, setShowBigResultsModal] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Escキーで大画面モーダルを閉じる
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showBigResultsModal) {
        setShowBigResultsModal(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showBigResultsModal]);

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // インクリメンタル検索 (Debounced)
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/cards?q=${encodeURIComponent(query.trim())}&limit=130`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.cards || []);
          setShowDropdown(true);
          setSelectedIndex(-1);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // サジェストから直接追加（検索結果は閉じずに維持）
  const handleDirectAdd = async (card: CardMaster, addCount: number = count) => {
    if (!targetStorageId) return;

    setAddingCardId(card.id);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_id: targetStorageId,
          card_id: card.id,
          count: addCount,
          condition,
          memo,
        }),
      });

      if (res.ok) {
        const targetStorageName = storages.find((s) => s.id === targetStorageId)?.name || 'ストレージ';
        setSuccessToast(`「${card.name}」を ${addCount}枚 追加しました！ (${targetStorageName})`);
        setTimeout(() => setSuccessToast(null), 3000);

        // 追加済みバッジの更新
        setRecentAddedMap((prev) => ({
          ...prev,
          [card.id]: (prev[card.id] || 0) + addCount,
        }));

        // インベントリ一覧の再取得（検索結果のドロップダウンは維持）
        onCardAdded();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingCardId(null);
    }
  };

  // キーボード操作ハンドラー
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (showDropdown && displaySuggestions.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < displaySuggestions.length - 1 ? prev + 1 : 0));
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (showDropdown && displaySuggestions.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displaySuggestions.length - 1));
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // 矢印キーでサジェストの候補を選んでいる場合（selectedIndex >= 0）はそのカードを追加
      if (showDropdown && selectedIndex >= 0 && displaySuggestions[selectedIndex]) {
        handleDirectAdd(displaySuggestions[selectedIndex], count);
      } else if (query.trim()) {
        // それ以外（通常入力後にENTERを押した場合）は、検索結果を大きく表示！
        setShowBigResultsModal(true);
        setShowDropdown(false);
      }
      return;
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
      setShowBigResultsModal(false);
    }
  };

  const chooseCard = (card: CardMaster) => {
    setSelectedCard(card);
    setQuery(card.name);
    setShowDropdown(false);
  };

  const clearSelection = () => {
    setSelectedCard(null);
    setQuery('');
    setCount(1);
    setMemo('');
    if (inputRef.current) inputRef.current.focus();
  };

  // ストレージに追加
  const handleSubmit = async () => {
    if (!selectedCard || !targetStorageId) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_id: targetStorageId,
          card_id: selectedCard.id,
          count,
          condition,
          memo,
        }),
      });

      if (res.ok) {
        const addedCardName = selectedCard.name;
        const targetStorageName = storages.find(s => s.id === targetStorageId)?.name || 'ストレージ';
        
        setSuccessToast(`「${addedCardName}」を ${count}枚 追加しました！ (${targetStorageName})`);
        setTimeout(() => setSuccessToast(null), 3000);

        // 次の入力に向けてリセット & フォーカス
        clearSelection();
        onCardAdded();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400">
            <Plus className="w-4 h-4" />
          </span>
          <h2 className="text-sm font-bold text-white tracking-wide">
            カードを検索してストレージに追加
          </h2>
          <span className="text-xs text-slate-400">（候補をクリックで即座に追加・連続追加可能）</span>
        </div>

        {/* トースト通知 */}
        {successToast && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs rounded-lg animate-fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>{successToast}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
        {/* 保管先ストレージ選択 */}
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
            <Box className="w-3 h-3 text-blue-400" />
            保管先ストレージ
          </label>
          <select
            value={targetStorageId}
            onChange={(e) => setTargetStorageId(parseInt(e.target.value, 10))}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.total_cards}枚)
              </option>
            ))}
          </select>
        </div>

        {/* カード名・型番 検索入力欄 */}
        <div className="lg:col-span-5 relative" ref={dropdownRef}>
          <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
            <span>カード名 または 型番</span>
            {selectedCard && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-0.5"
              >
                <X className="w-3 h-3" /> 選び直す
              </button>
            )}
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selectedCard) setSelectedCard(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0 && !selectedCard) setShowDropdown(true);
              }}
              placeholder="例: ボルシャック、DM26EX5、メンデルスゾーン... (Enterで大きく表示)"
              className={`w-full bg-slate-800/90 border ${
                selectedCard ? 'border-emerald-500/80 bg-slate-800' : 'border-slate-700'
              } text-white rounded-xl pl-9 pr-24 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500`}
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            {isLoading && (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin absolute right-3 top-2.5" />
            )}
            {!isLoading && query && (
              <div className="absolute right-2 top-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowBigResultsModal(true);
                    setShowDropdown(false);
                  }}
                  className="px-2 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white transition flex items-center gap-1 text-[11px] font-bold border border-blue-500/40"
                  title="Enterキーでも大きく表示できます"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>大画面</span>
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="p-1 text-slate-400 hover:text-white"
                  title="クリア"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* サジェストドロップダウン */}
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 divide-y divide-slate-800">
              {/* ドロップダウン内 ソート＆カードタイプ絞り込みバー */}
              <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur px-3 py-2 border-b border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400">
                    検索結果: <strong className="text-white">{displaySuggestions.length}</strong> 件
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 mr-0.5">並び順:</span>
                    <button
                      type="button"
                      onClick={() => setDropdownSort('relevance')}
                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold transition ${
                        dropdownSort === 'relevance'
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      関連度順
                    </button>
                    <button
                      type="button"
                      onClick={() => setDropdownSort('cost_asc')}
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-[10px] font-semibold transition ${
                        dropdownSort === 'cost_asc'
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <ArrowUp className="w-2.5 h-2.5" />
                      コスト小順
                    </button>
                    <button
                      type="button"
                      onClick={() => setDropdownSort('cost_desc')}
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-[10px] font-semibold transition ${
                        dropdownSort === 'cost_desc'
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <ArrowDown className="w-2.5 h-2.5" />
                      コスト大順
                    </button>
                    <button
                      type="button"
                      onClick={() => setDropdownSort('rarity_desc')}
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-[10px] font-semibold transition ${
                        dropdownSort === 'rarity_desc'
                          ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      レア度順
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                  {CARD_TYPE_CATEGORIES.map((tf) => (
                    <button
                      key={tf.value}
                      type="button"
                      onClick={() => setDropdownTypeFilter(tf.value)}
                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap transition ${
                        dropdownTypeFilter === tf.value
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                          : 'bg-slate-800/70 border-slate-700/70 text-slate-400 hover:text-white'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {displaySuggestions.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  選択中のカードタイプに一致する候補がありません
                </div>
              ) : (
                displaySuggestions.map((card, idx) => {
                  const colors = getCivilizationColor(card.civil);
                  const isSelected = idx === selectedIndex;
                  const backHit = findBackFaceHit(card, query);
                  const recentCount = recentAddedMap[card.id] || 0;
                  const isAddingThis = addingCardId === card.id;

                  return (
                    <div
                      key={card.id}
                      onClick={() => handleDirectAdd(card, count)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3 p-2.5 cursor-pointer transition group ${
                        isSelected ? 'bg-blue-600/25 text-white' : 'hover:bg-slate-800/80 text-slate-200'
                      }`}
                    >
                      {/* サムネイル（裏面でヒットした場合は裏面画像を表示） */}
                      <div className="relative w-10 h-14 bg-slate-800 rounded shrink-0 overflow-hidden border border-slate-700">
                        {(backHit?.image || card.image) ? (
                          <img
                            src={backHit?.image || card.image}
                            alt={backHit?.name || card.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                            DM
                          </div>
                        )}
                      </div>

                      {/* カード情報 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${colors.badge}`}>
                            {card.civil || '無色'}
                          </span>
                          {card.cost !== null && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 border border-slate-700 text-slate-300 rounded font-semibold">
                              Cost {card.cost}
                            </span>
                          )}
                          {card.rarity && card.rarity !== '-' && (
                            <span
                              className={`text-[10px] px-1.5 py-0.2 border rounded font-bold ${
                                getRarityBadgeStyle(card.rarity).className
                              }`}
                            >
                              {getRarityBadgeStyle(card.rarity).prefix}
                              {card.rarity}
                            </span>
                          )}
                          {card.type && (
                            <span className="text-[10px] text-slate-400">
                              {card.type}
                            </span>
                          )}
                        </div>

                        {card.name_ruby && (
                          <div className="text-[10px] text-sky-300/80 truncate leading-tight">
                            {card.name_ruby}
                          </div>
                        )}
                        <div className="font-semibold text-sm truncate text-white">
                          {card.name}
                        </div>

                        {card.alt_names && (
                          <div
                            className={`text-[11px] truncate mt-0.5 ${
                              backHit ? 'text-amber-300 font-semibold' : 'text-slate-400'
                            }`}
                            title={card.alt_names}
                          >
                            <span className="mr-1">⇄ 裏面:</span>
                            {card.alt_names}
                            {backHit && <span className="ml-1.5 text-[10px] text-amber-400/80">（裏面でヒット）</span>}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          <span className="text-indigo-400 font-mono">{card.pack}</span>
                          {card.race && <span className="ml-2 text-slate-500">[{card.race}]</span>}
                        </div>
                      </div>

                      {/* クイック追加アクション（クリックで直接追加、ドロップダウン維持） */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {recentCount > 0 && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-600/50 px-2 py-1 rounded-lg animate-fade-in">
                            ✓ +{recentCount}枚
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={isAddingThis}
                          onClick={() => handleDirectAdd(card, count)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                          title={`現在の設定枚数（${count}枚）で追加`}
                        >
                          {isAddingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>+{count}枚</span>
                            </>
                          )}
                        </button>
                        {count !== 1 && (
                          <button
                            type="button"
                            disabled={isAddingThis}
                            onClick={() => handleDirectAdd(card, 1)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
                            title="1枚追加"
                          >
                            +1
                          </button>
                        )}
                        {count !== 4 && (
                          <button
                            type="button"
                            disabled={isAddingThis}
                            onClick={() => handleDirectAdd(card, 4)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
                            title="4枚（1セット）一括追加"
                          >
                            +4
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* 大画面で開くフッターボタン */}
              {displaySuggestions.length > 0 && (
                <div
                  onClick={() => {
                    setShowBigResultsModal(true);
                    setShowDropdown(false);
                  }}
                  className="sticky bottom-0 z-10 p-2.5 bg-slate-950/95 hover:bg-blue-950/60 text-blue-300 border-t border-slate-800 flex items-center justify-between text-xs cursor-pointer transition font-medium backdrop-blur shadow-lg"
                >
                  <span className="flex items-center gap-1.5 font-bold">
                    <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>検索結果を大きく一覧表示する</span>
                  </span>
                  <span className="text-[10px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-bold">
                    ENTERキー
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 枚数選択 */}
        <div className="lg:col-span-2">
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            枚数
          </label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCount(num)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                  count === num
                    ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* 状態選択 & 追加ボタン */}
        <div className="lg:col-span-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              状態
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="プレイ用">プレイ用</option>
              <option value="美品">美品</option>
              <option value="キズあり">キズあり</option>
              <option value="未開封">未開封</option>
            </select>
          </div>

          <button
            type="button"
            disabled={!selectedCard || isSubmitting}
            onClick={handleSubmit}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shrink-0 ${
              selectedCard && !isSubmitting
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/25 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>追加 (Enter)</span>
          </button>
        </div>
      </div>

      {/* 選択されたカードのクイックプレビュー */}
      {selectedCard && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-semibold">選択中:</span>
            <span className="font-bold text-white text-sm">{selectedCard.name}</span>
            {selectedCard.alt_names && (
              <span className="text-amber-300/90">⇄ {selectedCard.alt_names}</span>
            )}
            <span className="text-slate-400 font-mono">({selectedCard.pack})</span>
            {selectedCard.rarity && (
              <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] text-purple-300">
                {selectedCard.rarity}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            追加先: <span className="text-white font-medium">{storages.find(s => s.id === targetStorageId)?.name}</span> / {count}枚
          </div>
        </div>
      )}

      {/* 大画面 検索結果モーダル（Enterキーまたは「大画面」ボタンで開く） */}
      {showBigResultsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6"
          onClick={() => setShowBigResultsModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/95 backdrop-blur flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base sm:text-lg">
                      「{query}」の検索結果
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600/20 text-blue-300 border border-blue-500/30">
                      {displaySuggestions.length} 件
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    カードをクリックして直接ストレージに追加できます（画面は閉じずに連続追加可能）
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* 保管先ストレージ */}
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-300">
                  <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-slate-400 shrink-0">保管先:</span>
                  <select
                    value={targetStorageId}
                    onChange={(e) => setTargetStorageId(parseInt(e.target.value, 10))}
                    className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                  >
                    {storages.map((s) => (
                      <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                        {s.name} ({s.total_cards}枚)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 閉じるボタン */}
                <button
                  type="button"
                  onClick={() => setShowBigResultsModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                  title="閉じる (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 絞り込み & ソートバー */}
            <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              {/* タイプ絞り込み */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {CARD_TYPE_CATEGORIES.map((tf) => (
                  <button
                    key={tf.value}
                    type="button"
                    onClick={() => setDropdownTypeFilter(tf.value)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap transition ${
                      dropdownTypeFilter === tf.value
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* ソート */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-500 text-[11px]">並び順:</span>
                <button
                  type="button"
                  onClick={() => setDropdownSort('relevance')}
                  className={`px-2 py-1 rounded border text-[11px] font-semibold transition ${
                    dropdownSort === 'relevance'
                      ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  関連度
                </button>
                <button
                  type="button"
                  onClick={() => setDropdownSort('cost_asc')}
                  className={`inline-flex items-center gap-0.5 px-2 py-1 rounded border text-[11px] font-semibold transition ${
                    dropdownSort === 'cost_asc'
                      ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowUp className="w-3 h-3" /> コスト順
                </button>
                <button
                  type="button"
                  onClick={() => setDropdownSort('rarity_desc')}
                  className={`inline-flex items-center gap-0.5 px-2 py-1 rounded border text-[11px] font-semibold transition ${
                    dropdownSort === 'rarity_desc'
                      ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-400" /> レア度順
                </button>
              </div>
            </div>

            {/* カードグリッド一覧 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/40">
              {displaySuggestions.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  一致するカードが見つかりません
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                  {displaySuggestions.map((card) => (
                    <BigCardResultTile
                      key={card.id}
                      card={card}
                      query={query}
                      count={count}
                      recentCount={recentAddedMap[card.id] || 0}
                      isAdding={addingCardId === card.id}
                      onAdd={handleDirectAdd}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* モーダルフッター */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/90 text-center text-xs text-slate-400 flex items-center justify-between px-6 shrink-0">
              <span>カード画像や「+1枚」「+4枚」を押すと、現在の保管先に直接追加されます</span>
              <span className="text-[11px] text-slate-500">Escキー または 右上「×」で閉じます</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
