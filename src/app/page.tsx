'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import CardRegisterBar from '@/components/CardRegisterBar';
import StorageSidebar from '@/components/StorageSidebar';
import InventoryView from '@/components/InventoryView';
import DataSyncModal from '@/components/DataSyncModal';
import { X, ExternalLink, Layers, PlusCircle, Folder, Smartphone, Plus, Minus } from 'lucide-react';
import { getCivilizationColor } from '@/lib/civilization';
import { StorageItem, InventoryItem, CardFace } from '@/types';
import {
  getCachedStorages,
  getCachedInventory,
  saveStoragesAndInventoryToCache,
  localUpdateInventoryCount,
  localDeleteInventoryItem,
  localClearInventory,
  getOfflineCardsCount,
  downloadAndCacheCardsBundle,
} from '@/lib/clientStorage';

export default function Home() {
  const [storages, setStorages] = useState<StorageItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedStorageId, setSelectedStorageId] = useState<number | 'all'>('all');
  const [selectedCardForModal, setSelectedCardForModal] = useState<InventoryItem | null>(null);
  const [modalFaceIndex, setModalFaceIndex] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showDataSyncModal, setShowDataSyncModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'inventory' | 'add' | 'storages'>('inventory');

  // ストレージ＆保管中カード一覧取得（サーバー接続失敗時は自動的にローカルキャッシュにフォールバック）
  const refreshAll = useCallback(async () => {
    try {
      const [sRes, iRes] = await Promise.all([
        fetch('/api/storages'),
        fetch('/api/inventory'),
      ]);

      if (sRes.ok && iRes.ok) {
        const sData = await sRes.json();
        const iData = await iRes.json();
        const nextStorages = sData.storages || [];
        const nextInventory = iData.items || [];
        setStorages(nextStorages);
        setInventory(nextInventory);
        setIsOfflineMode(false);
        saveStoragesAndInventoryToCache(nextStorages, nextInventory, false);
        return;
      }
    } catch {
      // Fall back to local cache
    }

    // Offline / Standalone fallback
    setIsOfflineMode(true);
    const cachedStorages = getCachedStorages();
    const cachedInventory = getCachedInventory();
    const synced = saveStoragesAndInventoryToCache(cachedStorages, cachedInventory, false);
    setStorages(synced.storages);
    setInventory(synced.inventory);
  }, []);

  useEffect(() => {
    refreshAll();

    // Auto-refresh when user focuses or returns to PC browser window
    const handleFocus = () => {
      refreshAll();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAll();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic auto-sync every 4 seconds when page is active (reflects phone sync immediately without reloading)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshAll();
      }
    }, 4000);

    // Register Service Worker & background-cache 24,049 card dictionary for offline smartphone use
    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
      getOfflineCardsCount().then((count) => {
        if (count < 20000) {
          downloadAndCacheCardsBundle().catch(() => {});
        }
      });
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [refreshAll]);

  // Keep modal card count in sync when inventory updates
  useEffect(() => {
    if (selectedCardForModal) {
      const updated = inventory.find((i) => i.id === selectedCardForModal.id);
      if (updated) {
        setSelectedCardForModal(updated);
      } else {
        setSelectedCardForModal(null);
      }
    }
  }, [inventory]);

  // 枚数更新ハンドラー
  const handleUpdateCount = async (id: number, newCount: number) => {
    try {
      let updatedOnServer = false;
      if (!isOfflineMode) {
        try {
          const res = await fetch(`/api/inventory/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: newCount }),
          });
          if (res.ok) updatedOnServer = true;
        } catch {
          updatedOnServer = false;
        }
      }

      if (!updatedOnServer) {
        localUpdateInventoryCount(id, newCount);
      }
      refreshAll();
    } catch (e) {
      console.error(e);
    }
  };

  // 削除ハンドラー（個別カード削除）
  const handleDeleteItem = async (id: number) => {
    try {
      let deletedOnServer = false;
      if (!isOfflineMode) {
        try {
          const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
          if (res.ok) deletedOnServer = true;
        } catch {
          deletedOnServer = false;
        }
      }

      if (!deletedOnServer) {
        localDeleteInventoryItem(id);
      }
      refreshAll();
    } catch (e) {
      console.error(e);
    }
  };

  // ストレージ内カードの全削除（一括削除）ハンドラー
  const handleClearStorageCards = async (storageId: number | 'all') => {
    const needConfirm =
      typeof window !== 'undefined' &&
      localStorage.getItem('dm_vault_confirm_delete_v2') === 'true';

    if (needConfirm) {
      const targetStorage = storageId === 'all' ? null : storages.find((s) => s.id === storageId);
      const confirmMsg = targetStorage
        ? `ストレージ「${targetStorage.name}」内のすべてのカード（${targetStorage.total_cards}枚）を一括削除しますか？\n（※ストレージ自体は残ります）`
        : `すべてのストレージ内の保管カード（合計${totalCards}枚）を一括削除しますか？\n（※ストレージ自体は残ります）`;

      if (!confirm(confirmMsg)) return;
    }

    try {
      let clearedOnServer = false;
      if (!isOfflineMode) {
        try {
          const res = await fetch(`/api/inventory?storageId=${storageId}`, { method: 'DELETE' });
          if (res.ok) clearedOnServer = true;
        } catch {
          clearedOnServer = false;
        }
      }

      if (!clearedOnServer) {
        localClearInventory(storageId);
      }
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
      faces = [
        {
          name: c.card_name,
          ruby: c.card_ruby || undefined,
          pack: c.card_pack,
          type: c.card_type,
          civil: c.card_civil,
          rarity: c.card_rarity,
          cost: c.card_cost,
          power: c.card_power,
          race: c.card_race,
          image: c.card_image,
        },
      ];
    }
    return faces;
  })();
  const modalFace = modalFaces[Math.min(modalFaceIndex, Math.max(modalFaces.length - 1, 0))];

  const openCardModal = (item: InventoryItem) => {
    setModalFaceIndex(0);
    setSelectedCardForModal(item);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col pb-16 lg:pb-0">
      {/* ヘッダー */}
      <Header
        totalInventoryCount={totalCards}
        uniqueInventoryCount={uniqueCards}
        isOfflineMode={isOfflineMode}
        onOpenDataSync={() => setShowDataSyncModal(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6">
        {/* スマホ向け：上部横スクロール・ストレージ即時切り替えバー */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto pb-2.5 mb-3 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedStorageId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border shrink-0 flex items-center gap-1.5 ${
              selectedStorageId === 'all'
                ? 'bg-blue-600 border-blue-500 text-white shadow'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>すべて ({totalCards}枚)</span>
          </button>
          {storages.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStorageId(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border shrink-0 flex items-center gap-1.5 ${
                selectedStorageId === s.id
                  ? 'bg-slate-800 border-blue-500 text-white shadow'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color || '#3b82f6' }}
              />
              <span>{s.name}</span>
              <span className="text-[10px] text-slate-400">({s.total_cards})</span>
            </button>
          ))}
        </div>

        {/* クイックカード検索・追加バー（PCでは常時表示、スマホでは「カード追加」または「保管一覧」タブで表示） */}
        <div className={`${mobileTab === 'storages' ? 'hidden lg:block' : 'block'}`}>
          <CardRegisterBar
            storages={storages}
            selectedStorageId={selectedStorageId}
            onCardAdded={refreshAll}
          />
        </div>

        {/* メインレイアウト: サイドバー + カード一覧 */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* サイドバー（PCでは常時左側に表示、スマホでは「ストレージ」タブ選択時に表示） */}
          <div className={`${mobileTab === 'storages' ? 'block w-full' : 'hidden'} lg:block lg:w-72 shrink-0`}>
            <StorageSidebar
              storages={storages}
              selectedStorageId={selectedStorageId}
              onSelectStorage={(id) => {
                setSelectedStorageId(id);
                setMobileTab('inventory');
              }}
              onRefresh={refreshAll}
              onClearStorageCards={handleClearStorageCards}
            />
          </div>

          {/* 保管カード一覧（PCでは常時表示、スマホでは「ストレージ」タブ以外で表示） */}
          <div className={`${mobileTab === 'storages' ? 'hidden lg:block' : 'block'} flex-1 w-full min-w-0`}>
            <InventoryView
              items={inventory}
              storages={storages}
              selectedStorageId={selectedStorageId}
              onUpdateCount={handleUpdateCount}
              onDeleteItem={handleDeleteItem}
              onClearStorageCards={handleClearStorageCards}
              onSelectCardDetail={openCardModal}
            />
          </div>
        </div>
      </main>

      {/* スマホ専用 下部固定ナビゲーションバー */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-2 py-1.5 grid grid-cols-4 gap-1">
        <button
          type="button"
          onClick={() => {
            setMobileTab('inventory');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold transition ${
            mobileTab === 'inventory' ? 'text-blue-400 bg-blue-600/15' : 'text-slate-400'
          }`}
        >
          <Layers className="w-4 h-4 mb-0.5" />
          <span>保管一覧</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileTab('add');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold transition ${
            mobileTab === 'add' ? 'text-blue-400 bg-blue-600/15' : 'text-slate-400'
          }`}
        >
          <PlusCircle className="w-4 h-4 mb-0.5" />
          <span>カード検索追加</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('storages')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold transition ${
            mobileTab === 'storages' ? 'text-blue-400 bg-blue-600/15' : 'text-slate-400'
          }`}
        >
          <Folder className="w-4 h-4 mb-0.5" />
          <span>ストレージ管理</span>
        </button>
        <button
          type="button"
          onClick={() => setShowDataSyncModal(true)}
          className="flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white transition"
        >
          <Smartphone className="w-4 h-4 mb-0.5 text-indigo-400" />
          <span>スマホ・保存</span>
        </button>
      </nav>

      {/* スマホ連携・データ管理モーダル */}
      <DataSyncModal
        isOpen={showDataSyncModal}
        onClose={() => setShowDataSyncModal(false)}
        isOfflineMode={isOfflineMode}
        onDataUpdated={refreshAll}
      />

      {/* カード拡大モーダル */}
      {selectedCardForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedCardForModal(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl p-5 sm:p-6 relative animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedCardForModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center">
              {/* カード画像 */}
              <div className="w-56 sm:w-64 aspect-[7/10] rounded-2xl overflow-hidden shadow-2xl border border-slate-700 mb-3 bg-slate-950">
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

                {/* モーダル内でも直接枚数の加減算が可能 */}
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    保管場所: <span className="text-white font-medium">{selectedCardForModal.storage_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateCount(selectedCardForModal.id, selectedCardForModal.count - 1)}
                      className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-white active:scale-95"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-blue-400 font-extrabold text-base min-w-[3rem] text-center">
                      {selectedCardForModal.count}枚
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateCount(selectedCardForModal.id, selectedCardForModal.count + 1)}
                      className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-white active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
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
