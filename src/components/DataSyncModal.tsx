'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Download,
  Upload,
  Database,
  Check,
  RefreshCw,
  Wifi,
  FileCode2,
  Copy,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getOfflineCardsCount,
  downloadAndCacheCardsBundle,
  createLocalBackupObject,
  importBackupToLocal,
  hasPendingOfflineChanges,
  clearPendingOfflineChanges,
  BackupData,
} from '@/lib/clientStorage';

interface DataSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOfflineMode: boolean;
  onDataUpdated: () => void;
}

export default function DataSyncModal({
  isOpen,
  onClose,
  isOfflineMode,
  onDataUpdated,
}: DataSyncModalProps) {
  const [activeTab, setActiveTab] = useState<'portable' | 'backup' | 'wifi'>('portable');
  const [cachedCardsCount, setCachedCardsCount] = useState<number>(0);
  const [isCachingCards, setIsCachingCards] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lanInfo, setLanInfo] = useState<{ ip: string; port: string; lanUrl: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatusMsg(null);
    getOfflineCardsCount().then(setCachedCardsCount);

    fetch('/api/network-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.lanUrl) setLanInfo(d);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCacheDictionary = async () => {
    setIsCachingCards(true);
    setStatusMsg(null);
    try {
      const count = await downloadAndCacheCardsBundle();
      setCachedCardsCount(count);
      setStatusMsg({
        type: 'success',
        text: `全${count.toLocaleString()}枚のカード辞書をこの端末に保存しました！PCオフ時も全カード検索が可能です。`,
      });
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: 'PCサーバーに接続できないためカード辞書を取得できませんでした。PC起動中にお試しください。',
      });
    } finally {
      setIsCachingCards(false);
    }
  };

  const handleDownloadPortableHtml = () => {
    window.location.href = '/api/portable';
    setStatusMsg({
      type: 'success',
      text: 'スマホ・PC単体版HTMLファイル（DM-Vault-Portable.html）のダウンロードを開始しました！',
    });
  };

  const handleExportJson = async () => {
    setStatusMsg(null);
    try {
      let backupData: BackupData;
      if (!isOfflineMode) {
        const res = await fetch('/api/backup');
        if (res.ok) {
          backupData = await res.json();
        } else {
          backupData = createLocalBackupObject();
        }
      } else {
        backupData = createLocalBackupObject();
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `dm-vault-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setStatusMsg({
        type: 'success',
        text: '現在のストレージ・所持カードデータをJSONファイルに書き出しました。',
      });
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: '書き出しに失敗しました: ' + e.message });
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMsg(null);

    try {
      const text = await file.text();
      const parsed: BackupData = JSON.parse(text);
      if (!Array.isArray(parsed.storages) || !Array.isArray(parsed.inventory)) {
        throw new Error('有効なバックアップファイルではありません');
      }

      // Always update local cache
      importBackupToLocal(parsed, importMode);

      // If connected to PC server, also update SQLite DB
      if (!isOfflineMode) {
        const res = await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storages: parsed.storages,
            inventory: parsed.inventory,
            mode: importMode,
          }),
        });
        if (!res.ok) {
          throw new Error('サーバーDBへの反映に失敗しました');
        }
        clearPendingOfflineChanges();
      }

      onDataUpdated();
      setStatusMsg({
        type: 'success',
        text: `データを読み込みました！（ストレージ: ${parsed.storages.length}個 / カードレコード: ${parsed.inventory.length}件）`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: '読み込みエラー: ' + err.message });
    } finally {
      e.target.value = '';
    }
  };

  const handleSyncOfflineChangesToServer = async () => {
    setIsSyncingPending(true);
    setStatusMsg(null);
    try {
      const localData = createLocalBackupObject();
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storages: localData.storages,
          inventory: localData.inventory,
          mode: 'replace',
        }),
      });
      if (!res.ok) throw new Error('PCサーバーへの同期に失敗しました');
      clearPendingOfflineChanges();
      onDataUpdated();
      setStatusMsg({
        type: 'success',
        text: 'スマホ・ローカルで変更したデータをPC本体のデータベースに同期しました！',
      });
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message });
    } finally {
      setIsSyncingPending(false);
    }
  };

  const copyLanUrl = () => {
    if (!lanInfo?.lanUrl) return;
    navigator.clipboard.writeText(lanInfo.lanUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">
                スマホ連携・データ管理
              </h3>
              <p className="text-[11px] text-slate-400">
                外出先でのスマホ単体利用・バックアップ・PCとの同期
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* タブ切り替え */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950/60 border-b border-slate-800 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('portable')}
            className={`py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === 'portable'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>外出先・単体利用</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === 'backup'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>書き出し/復元</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wifi')}
            className={`py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === 'wifi'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 shrink-0" />
            <span>自宅Wi-Fi接続</span>
          </button>
        </div>

        {/* コンテンツ本体 */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300">
          {statusMsg && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-200'
                  : 'bg-red-950/70 border-red-600/50 text-red-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {hasPendingOfflineChanges() && !isOfflineMode && (
            <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-amber-300 text-xs">
                  未同期のローカル変更データがあります
                </div>
                <div className="text-[11px] text-amber-200/80">
                  オフライン中に変更した内容をPC本体データベースへ反映できます
                </div>
              </div>
              <button
                onClick={handleSyncOfflineChangesToServer}
                disabled={isSyncingPending}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPending ? 'animate-spin' : ''}`} />
                <span>PC本体に同期する</span>
              </button>
            </div>
          )}

          {activeTab === 'portable' && (
            <div className="space-y-4">
              {/* 方法0: Android用アプリ (.apk) のインストール */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-800/80 border border-emerald-500/40 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      🤖 Android用インストールファイル (.apk)
                    </h4>
                    <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                      Androidスマホに直接インストールして<strong>ネイティブアプリとして起動できる <code>デュエマ管理アプリ.apk</code></strong> です。
                      全24,049枚のカード辞書をアプリ内に内蔵しており、外出先でもアプリ単体で高速動作し、自宅Wi-FiでPC本体とワンタップ同期も可能です。
                    </p>
                  </div>
                </div>
                <a
                  href="/DM-Vault.apk"
                  download="デュエマ管理アプリ.apk"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Androidアプリ (デュエマ管理アプリ.apk) をダウンロード</span>
                </a>
              </div>

              {/* 方法1: 単体HTMLファイルの出力 */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <FileCode2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      ① スマホ持ち出し用「単体動作ファイル (.html)」を出力
                    </h4>
                    <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                      全24,049枚のカード辞書と現在の保管カードデータを<strong>たった1つのHTMLファイル</strong>にまとめて出力します。
                      LINEのKeepメモ・Googleドライブ・iCloud・AirDrop等でスマホに送って開くだけで、<strong>外出先（PC電源オフ時）でもスマホ単体で全カード検索・枚数変更・カード追加が完結</strong>します。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isOfflineMode}
                  onClick={handleDownloadPortableHtml}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>スマホ・PC単体版アプリ (.html) を書き出す</span>
                </button>
                <div className="text-[11px] text-slate-400 bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                  💡 プロジェクトフォルダ内の <code>スマホ・PC単体版_DM-Vault.html</code> も同じ単体動作ファイルとしてそのままスマホや別PCにコピーして使えます。
                </div>
              </div>

              {/* 方法2: このブラウザにオフライン辞書をキャッシュ */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      ② このブラウザに全カード辞書をオフライン保存（PWA対応）
                    </h4>
                    <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                      自宅Wi-Fiでこの画面をスマホで開き、下のボタンを押して「ホーム画面に追加」しておくと、外出先でPCが起動していない時でもそのまま全24,049枚の検索と保管庫の操作ができます。
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-slate-900/90 px-3.5 py-2.5 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-400">端末内カード辞書: </span>
                    {cachedCardsCount > 0 ? (
                      <span className="text-emerald-400 font-bold">
                        保存済み ({cachedCardsCount.toLocaleString()}枚)
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold">未保存</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isCachingCards || isOfflineMode}
                    onClick={handleCacheDictionary}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCachingCards ? 'animate-spin' : ''}`} />
                    <span>{cachedCardsCount > 0 ? '辞書を再保存' : '全カード辞書を保存'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* JSON書き出し */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-400" />
                  保管データの書き出し（エクスポート）
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  現在のすべての保管ストレージと所持カード一覧をJSONファイル（<code>.json</code>）として保存します。スマホへのデータ移行やバックアップに使えます。
                </p>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>現在のデータをJSONファイルに書き出す</span>
                </button>
              </div>

              {/* JSON読み込み */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  保管データの読み込み（インポート・同期）
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  スマホ単体版や別PCで書き出したJSONファイルを読み込みます。
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      importMode === 'merge'
                        ? 'bg-emerald-600/20 border-emerald-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">統合（マージ）</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      既存データを残して追加・更新（おすすめ）
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      importMode === 'replace'
                        ? 'bg-amber-600/20 border-amber-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">上書き復元</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      ファイルの内容で完全に置き換える
                    </div>
                  </button>
                </div>

                <label className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>JSONファイルを選択して読み込む</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'wifi' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-sky-400" />
                  自宅Wi-Fiでスマホから直接アクセスする
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  PCとスマホが同じWi-Fiに接続されている場合、スマホのブラウザ（Safari / Chrome）で以下のアドレスを開くと、PCと同じ保管庫をスマホから直接操作できます。
                </p>

                <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-700 rounded-xl p-3">
                  <code className="text-sm font-mono font-bold text-sky-300 select-all">
                    {lanInfo?.lanUrl || 'http://localhost:3000'}
                  </code>
                  <button
                    type="button"
                    onClick={copyLanUrl}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 shrink-0"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'コピー済' : 'URLをコピー'}</span>
                  </button>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <div className="font-bold text-slate-200">💡 外出先へそのまま持ち出すコツ：</div>
                  <div>1. 自宅でスマホから上のURLを開く</div>
                  <div>2. この画面の「外出先・単体利用」タブで<strong>「全カード辞書を保存」</strong>を押す</div>
                  <div>3. スマホブラウザのメニューから<strong>「ホーム画面に追加」</strong>すると、外出先（PCオフ時）でもスマホ単体でいつでも開けます！</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

