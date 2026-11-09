'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Check, Box, Loader2, X, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
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
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // インクリメンタル検索 (Debounced)
  useEffect(() => {
    if (!query.trim() || selectedCard) {
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
  }, [query, selectedCard]);

  // キーボード操作ハンドラー
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || displaySuggestions.length === 0) {
      if (e.key === 'Enter' && selectedCard) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < displaySuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displaySuggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && displaySuggestions[selectedIndex]) {
        chooseCard(displaySuggestions[selectedIndex]);
      } else if (displaySuggestions.length > 0) {
        chooseCard(displaySuggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
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
          <span className="text-xs text-slate-400">（カード名または型番を入力）</span>
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
              placeholder="例: ボルシャック、DM26EX5、メンデルスゾーン..."
              className={`w-full bg-slate-800/90 border ${
                selectedCard ? 'border-emerald-500/80 bg-slate-800' : 'border-slate-700'
              } text-white rounded-xl pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500`}
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            {isLoading && (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin absolute right-3 top-2.5" />
            )}
            {!isLoading && query && (
              <button
                type="button"
                onClick={clearSelection}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
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
                return (
                  <div
                    key={card.id}
                    onClick={() => chooseCard(card)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3 p-2.5 cursor-pointer transition ${
                      isSelected ? 'bg-blue-600/20 text-white' : 'hover:bg-slate-800/80 text-slate-200'
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
                  </div>
                );
              })
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
    </div>
  );
}
