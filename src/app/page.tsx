'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import CardRegisterBar from '@/components/CardRegisterBar';
import StorageSidebar from '@/components/StorageSidebar';
import InventoryView from '@/components/InventoryView';
import { X, ExternalLink } from 'lucide-react';
import { getCivilizationColor } from '@/lib/civilization';
import { StorageItem, InventoryItem, CardFace } from '@/types';
import { api } from '@/lib/api';

export default function Home() {
  const [storages, setStorages] = useState<StorageItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedStorageId, setSelectedStorageId] = useState<number | 'all'>('all');
  const [selectedCardForModal, setSelectedCardForModal] = useState<InventoryItem | null>(null);
  const [modalFaceIndex, setModalFaceIndex] = useState(0);

  // ストレージ一覧取得
  const loadStorages = useCallback(async () => {
    try {
      const data = await api.getStorages();
      setStorages(data.storages || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 保管中カード一覧取得
  const loadInventory = useCallback(async () => {
    try {
      const data = await api.getInventory();
      setInventory(data.items || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadStorages();
    loadInventory();
  }, [loadStorages, loadInventory]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // 枚数更新ハンドラー
  const handleUpdateCount = async (id: number, newCount: number) => {
    try {
      await api.updateInventoryCount(id, newCount);
      refreshAll();
    } catch (e) {
      console.error(e);
    }
  };

  // 削除ハンドラー（個別カード削除）
  const handleDeleteItem = async (id: number) => {
    try {
      await api.deleteInventoryItem(id);
      refreshAll();
    } catch (e) {
      console.error(e);
    }
  };

  // ストレージ内のカード全削除ハンドラー
  const handleClearStorage = async (storageId: number | 'all') => {
    try {
      await api.clearStorage(storageId);
      refreshAll();
    } catch (e) {
      console.error(e);
    }
  };

  const totalCards = inventory.reduce((acc, cur) => acc + cur.count, 0);
  const uniqueCards = new Set(inventory.map((i) => i.card_id)).size;

  // モーダル表示用：全面（表面＋裏面・覚醒面）
  const modalFaces: CardFace[] = (() => {
    if (!selectedCardForModal) return [];
    const c = selectedCardForModal;
    let faces: CardFace[] = [];
    try {
      faces = c.card_faces_json ? JSON.parse(c.card_faces_json) : [];
    } catch {
      faces = [];
    }
    if (faces.length === 0) {
      faces = [{
        name: c.card_name, ruby: c.card_ruby || undefined, pack: c.card_pack, type: c.card_type, civil: c.card_civil,
        rarity: c.card_rarity, cost: c.card_cost, power: c.card_power, race: c.card_race, image: c.card_image,
      }];
    }
    return faces;
  })();
  const modalFace = modalFaces[Math.min(modalFaceIndex, Math.max(modalFaces.length - 1, 0))];

  const openCardModal = (item: InventoryItem) => {
    setModalFaceIndex(0);
    setSelectedCardForModal(item);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* ヘッダー */}
      <Header
        totalInventoryCount={totalCards}
        uniqueInventoryCount={uniqueCards}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* クイックカード検索・追加バー */}
        <CardRegisterBar
          storages={storages}
          selectedStorageId={selectedStorageId}
          onCardAdded={refreshAll}
        />

        {/* メインレイアウト: サイドバー + カード一覧 */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <StorageSidebar
            storages={storages}
            selectedStorageId={selectedStorageId}
            onSelectStorage={setSelectedStorageId}
            onRefresh={refreshAll}
            onClearStorage={handleClearStorage}
          />

          <InventoryView
            items={inventory}
            storages={storages}
            selectedStorageId={selectedStorageId}
            onUpdateCount={handleUpdateCount}
            onDeleteItem={handleDeleteItem}
            onClearStorage={handleClearStorage}
            onSelectCardDetail={openCardModal}
          />
        </div>
      </main>

      {/* カード拡大モーダル */}
      {selectedCardForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedCardForModal(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl p-6 relative animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedCardForModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center">
              {/* カード画像 */}
              <div className="w-64 aspect-[7/10] rounded-2xl overflow-hidden shadow-2xl border border-slate-700 mb-3 bg-slate-950">
                {modalFace.image ? (
                  <img
                    src={modalFace.image}
                    alt={modalFace.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                    画像なし
                  </div>
                )}
              </div>

              {/* 裏面・覚醒面の切り替え */}
              {modalFaces.length > 1 && (
                <div className="flex items-center gap-1.5 mb-3">
                  {modalFaces.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setModalFaceIndex(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        i === modalFaceIndex
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {i === 0 ? '表面' : modalFaces.length > 2 ? `裏面${i}` : '裏面'}
                    </button>
                  ))}
                </div>
              )}

              {/* カード詳細情報 */}
              <div className="w-full space-y-2 text-center">
                {(modalFace.ruby || (modalFaceIndex === 0 && selectedCardForModal.card_ruby)) && (
                  <div className="text-[11px] text-sky-300/80 tracking-wide -mb-1.5">
                    {modalFace.ruby || selectedCardForModal.card_ruby}
                  </div>
                )}
                <h3 className="font-extrabold text-lg text-white">
                  {modalFace.name}
                </h3>
                <div className="text-xs font-mono text-indigo-400">
                  {selectedCardForModal.card_pack}
                </div>
                {modalFace.type && (
                  <div className="text-[11px] text-slate-400">{modalFace.type}</div>
                )}

                <div className="flex items-center justify-center gap-2 pt-2 flex-wrap text-xs">
                  <span className={`px-2 py-0.5 rounded font-bold ${getCivilizationColor(modalFace.civil).badge}`}>
                    {modalFace.civil || '無色'}
                  </span>
                  {modalFace.cost !== null && modalFace.cost !== undefined && (
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-200 rounded font-semibold border border-slate-700">
                      コスト {modalFace.cost}
                    </span>
                  )}
                  {selectedCardForModal.card_rarity && (
                    <span className="px-2 py-0.5 bg-purple-950 text-purple-300 rounded font-semibold border border-purple-800/40">
                      {selectedCardForModal.card_rarity}
                    </span>
                  )}
                  {modalFace.power && (
                    <span className="px-2 py-0.5 bg-red-950 text-red-300 rounded font-semibold border border-red-800/40">
                      パワー {modalFace.power}
                    </span>
                  )}
                </div>

                {modalFace.race && (
                  <p className="text-xs text-slate-400 pt-1">
                    種族: {modalFace.race}
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    保管場所: <span className="text-white font-medium">{selectedCardForModal.storage_name}</span>
                  </div>
                  <div>
                    所持枚数: <span className="text-blue-400 font-bold text-sm">{selectedCardForModal.count}枚</span>
                  </div>
                </div>

                <div className="pt-2">
                  <a
                    href={`https://dm.takaratomy.co.jp/card/detail/?id=${selectedCardForModal.card_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline pt-2"
                  >
                    公式カード詳細ページを開く <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
