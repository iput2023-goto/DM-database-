'use client';

import React, { useState } from 'react';
import { Box, Plus, Trash2, Edit2, Layers, Folder, ChevronRight, X, RotateCcw } from 'lucide-react';
import { StorageItem } from '@/types';

interface StorageSidebarProps {
  storages: StorageItem[];
  selectedStorageId: number | 'all';
  onSelectStorage: (id: number | 'all') => void;
  onRefresh: () => void;
  onClearStorage?: (storageId: number | 'all') => void;
}

export default function StorageSidebar({
  storages,
  selectedStorageId,
  onSelectStorage,
  onRefresh,
  onClearStorage,
}: StorageSidebarProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [newMemo, setNewMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalCardsAll = storages.reduce((acc, cur) => acc + cur.total_cards, 0);

  const colorPresets = [
    '#3b82f6', // 青
    '#ef4444', // 赤
    '#22c55e', // 緑
    '#eab308', // 黄
    '#a855f7', // 紫
    '#64748b', // グレー
  ];

  const handleCreateStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/storages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          memo: newMemo.trim(),
        }),
      });

      if (res.ok) {
        setNewName('');
        setNewMemo('');
        setShowAddModal(false);
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStorage = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`ストレージ「${name}」を削除してもよろしいですか？\n（※中のカードデータも削除されます）`)) {
      return;
    }

    try {
      const res = await fetch(`/api/storages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedStorageId === id) {
          onSelectStorage('all');
        }
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ストレージ内のカードのみ全削除
  const handleClearStorageCards = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onClearStorage) return;
    if (!confirm(`ストレージ「${name}」内のカードをすべて削除しますか？\n（※ストレージBOX自体は削除されません）`)) {
      return;
    }
    await onClearStorage(id);
  };

  return (
    <aside className="w-full lg:w-72 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col shrink-0 h-fit shadow-lg">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-blue-400" />
          <h2 className="font-bold text-sm text-white">保管ストレージ一覧</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition text-xs flex items-center gap-1"
          title="新規ストレージ追加"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-medium text-[11px]">追加</span>
        </button>
      </div>

      <div className="space-y-1.5">
        {/* 全ストレージ表示 */}
        <button
          onClick={() => onSelectStorage('all')}
          className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
            selectedStorageId === 'all'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 opacity-80" />
            <span>すべてのカード</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] ${
              selectedStorageId === 'all'
                ? 'bg-blue-500/80 text-white'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {totalCardsAll}枚
          </span>
        </button>

        {/* 各ストレージ */}
        {storages.map((s) => {
          const isSelected = selectedStorageId === s.id;
          return (
            <div
              key={s.id}
              onClick={() => onSelectStorage(s.id)}
              className={`group w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${
                isSelected
                  ? 'bg-slate-800 border border-blue-500/50 text-white'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: s.color || '#3b82f6' }}
                />
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  {s.memo && (
                    <div className="text-[10px] text-slate-500 truncate">{s.memo}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 border border-slate-700/60 text-slate-300">
                  {s.total_cards}枚
                </span>
                {s.total_cards > 0 && onClearStorage && (
                  <button
                    type="button"
                    onClick={(e) => handleClearStorageCards(s.id, s.name, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-amber-400 transition"
                    title="このストレージのカードを全削除（空にする）"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => handleDeleteStorage(s.id, s.name, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition"
                  title="ストレージ自体を削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 新規ストレージ作成モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Box className="w-4 h-4 text-blue-400" />
                新規ストレージの作成
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStorage} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  ストレージ名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 白ストレージ BOX-2、火自然デッキケース..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  タグカラー
                </label>
                <div className="flex items-center gap-2">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        newColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  メモ (任意)
                </label>
                <input
                  type="text"
                  placeholder="例: 本棚の2段目、赤単速攻デッキ用など"
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  作成する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
