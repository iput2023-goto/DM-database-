import { StorageItem, InventoryItem, CardMaster, CardFace } from '@/types';
import { normalizeForSearch, buildSearchKey } from './normalize';

const LS_STORAGES_KEY = 'dm_vault_storages_v1';
const LS_INVENTORY_KEY = 'dm_vault_inventory_v1';
const LS_PENDING_SYNC_KEY = 'dm_vault_pending_sync_v1';
const IDB_NAME = 'dm_vault_offline_db';
const IDB_STORE = 'cards_bundle';
const IMAGE_PREFIX = 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/';

export interface BackupData {
  version: number;
  exportedAt: string;
  storages: StorageItem[];
  inventory: InventoryItem[];
}

// Compact tuple format from /api/cards-bundle:
// [id, name, name_ruby, pack, type, civil, rarity, cost, power, race, imgShort, alt_names, facesShortJson]
export type CompactCardTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  number | null,
  string,
  string,
  string,
  string,
  string
];

interface IndexedCard extends CardMaster {
  search_key: string;
}

let memoryCardsCache: IndexedCard[] | null = null;

function expandImageUrl(img: string): string {
  if (!img) return '';
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('/')) return img;
  return IMAGE_PREFIX + img;
}

export function tupleToCard(t: CompactCardTuple): IndexedCard {
  const [id, name, name_ruby, pack, type, civil, rarity, cost, power, race, imgShort, alt_names, facesShort] = t;
  const image = expandImageUrl(imgShort);
  let faces: CardFace[] = [];
  if (facesShort) {
    try {
      const parsed = JSON.parse(facesShort) as CardFace[];
      faces = parsed.map((f) => ({
        ...f,
        image: expandImageUrl(f.image || ''),
      }));
    } catch {
      faces = [];
    }
  }
  const alts = alt_names ? alt_names.split(' / ') : [];
  const search_key = buildSearchKey([name, name_ruby, ...alts, pack, id, race]);
  return {
    id,
    name,
    name_ruby: name_ruby || null,
    pack,
    type,
    civil,
    rarity,
    cost,
    power,
    race,
    image,
    alt_names: alt_names || null,
    faces,
    search_key,
  };
}

// --- LocalStorage (Storages & Inventory) ---

const DEFAULT_STORAGES: StorageItem[] = [
  { id: 1, name: 'ストレージBOX 1（メイン保管）', color: '#3b82f6', memo: '大容量ストレージ箱', total_cards: 0, unique_cards: 0 },
  { id: 2, name: 'デッキケース 1', color: '#ef4444', memo: '大会用・調整中デッキ', total_cards: 0, unique_cards: 0 },
  { id: 3, name: 'コレクションバインダー', color: '#f59e0b', memo: 'SR・高額・お気に入りカード', total_cards: 0, unique_cards: 0 },
];

export function getCachedStorages(): StorageItem[] {
  if (typeof window === 'undefined') return DEFAULT_STORAGES;
  try {
    const raw = localStorage.getItem(LS_STORAGES_KEY);
    if (!raw) return DEFAULT_STORAGES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_STORAGES;
  } catch {
    return DEFAULT_STORAGES;
  }
}

export function getCachedInventory(): InventoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_INVENTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoragesAndInventoryToCache(
  storages: StorageItem[],
  inventory: InventoryItem[],
  markPending = false
): { storages: StorageItem[]; inventory: InventoryItem[] } {
  // Recalculate totals on storages based on inventory
  const recomputedStorages = storages.map((s) => {
    const matching = inventory.filter((i) => i.storage_id === s.id);
    const total_cards = matching.reduce((acc, cur) => acc + cur.count, 0);
    const unique_cards = matching.length;
    return { ...s, total_cards, unique_cards };
  });

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LS_STORAGES_KEY, JSON.stringify(recomputedStorages));
      localStorage.setItem(LS_INVENTORY_KEY, JSON.stringify(inventory));
      if (markPending) {
        localStorage.setItem(LS_PENDING_SYNC_KEY, 'true');
      }
    } catch (e) {
      console.error('LocalStorage save error:', e);
    }
  }
  return { storages: recomputedStorages, inventory };
}

export function hasPendingOfflineChanges(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(LS_PENDING_SYNC_KEY) === 'true';
}

export function clearPendingOfflineChanges(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_PENDING_SYNC_KEY);
}

// --- Offline CRUD Operations ---

export function localCreateStorage(name: string, color: string, memo: string): StorageItem {
  const storages = getCachedStorages();
  const inventory = getCachedInventory();
  const nextId = storages.reduce((max, s) => Math.max(max, s.id), 0) + 1;
  const newStorage: StorageItem = {
    id: nextId,
    name: name.trim(),
    color: color || '#3b82f6',
    memo: memo?.trim() || '',
    total_cards: 0,
    unique_cards: 0,
  };
  saveStoragesAndInventoryToCache([...storages, newStorage], inventory, true);
  return newStorage;
}

export function localDeleteStorage(id: number): void {
  const storages = getCachedStorages().filter((s) => s.id !== id);
  const inventory = getCachedInventory().filter((i) => i.storage_id !== id);
  saveStoragesAndInventoryToCache(storages, inventory, true);
}

export function localAddInventoryItem(
  storageId: number,
  card: CardMaster,
  count: number,
  condition: string,
  memo: string
): void {
  const storages = getCachedStorages();
  const inventory = getCachedInventory();
  const targetStorage = storages.find((s) => s.id === storageId) || storages[0];
  if (!targetStorage) return;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const existingIdx = inventory.findIndex(
    (i) => i.storage_id === storageId && i.card_id === card.id && i.condition === condition
  );

  let nextInventory: InventoryItem[];
  if (existingIdx >= 0) {
    nextInventory = [...inventory];
    nextInventory[existingIdx] = {
      ...nextInventory[existingIdx],
      count: nextInventory[existingIdx].count + count,
      updated_at: now,
    };
  } else {
    const nextId = inventory.reduce((max, i) => Math.max(max, i.id), 0) + 1;
    const newItem: InventoryItem = {
      id: nextId,
      storage_id: targetStorage.id,
      storage_name: targetStorage.name,
      storage_color: targetStorage.color,
      card_id: card.id,
      card_name: card.name,
      card_ruby: card.name_ruby || null,
      card_pack: card.pack || '',
      card_type: card.type || '',
      card_civil: card.civil || '',
      card_rarity: card.rarity || '',
      card_cost: card.cost ?? null,
      card_power: card.power || '',
      card_race: card.race || '',
      card_image: card.image || '',
      card_alt_names: card.alt_names || null,
      card_faces_json: card.faces && card.faces.length > 0 ? JSON.parse(JSON.stringify(card.faces)) && JSON.stringify(card.faces) : null,
      count,
      condition: condition || 'プレイ用',
      memo: memo || '',
      updated_at: now,
    };
    nextInventory = [newItem, ...inventory];
  }

  saveStoragesAndInventoryToCache(storages, nextInventory, true);
}

export function localUpdateInventoryCount(id: number, newCount: number): void {
  const storages = getCachedStorages();
  const inventory = getCachedInventory();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let nextInventory: InventoryItem[];
  if (newCount <= 0) {
    nextInventory = inventory.filter((i) => i.id !== id);
  } else {
    nextInventory = inventory.map((i) =>
      i.id === id ? { ...i, count: newCount, updated_at: now } : i
    );
  }
  saveStoragesAndInventoryToCache(storages, nextInventory, true);
}

export function localDeleteInventoryItem(id: number): void {
  const storages = getCachedStorages();
  const inventory = getCachedInventory().filter((i) => i.id !== id);
  saveStoragesAndInventoryToCache(storages, inventory, true);
}

export function localClearInventory(storageId: number | 'all'): void {
  const storages = getCachedStorages();
  const inventory =
    storageId === 'all'
      ? []
      : getCachedInventory().filter((i) => i.storage_id !== storageId);
  saveStoragesAndInventoryToCache(storages, inventory, true);
}

// --- IndexedDB Card Dictionary (All 24,049 Cards for Offline Smartphone Search) ---

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineCardsCount(): Promise<number> {
  if (memoryCardsCache) return memoryCardsCache.length;
  if (typeof window === 'undefined' || !('indexedDB' in window)) return 0;
  try {
    const db = await openIdb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get('count');
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function downloadAndCacheCardsBundle(): Promise<number> {
  const res = await fetch('/api/cards-bundle');
  if (!res.ok) throw new Error('カード辞書の取得に失敗しました');
  const data = await res.json();
  const tuples: CompactCardTuple[] = data.cards || [];
  memoryCardsCache = tuples.map(tupleToCard);

  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(tuples, 'tuples');
      store.put(tuples.length, 'count');
      store.put(new Date().toISOString(), 'updatedAt');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return tuples.length;
}

async function ensureMemoryCardsLoaded(): Promise<IndexedCard[]> {
  if (memoryCardsCache) return memoryCardsCache;
  if (typeof window === 'undefined' || !('indexedDB' in window)) return [];
  try {
    const db = await openIdb();
    const tuples = await new Promise<CompactCardTuple[] | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get('tuples');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (tuples && Array.isArray(tuples)) {
      memoryCardsCache = tuples.map(tupleToCard);
      return memoryCardsCache;
    }
  } catch {
    // ignore
  }
  return [];
}

export async function searchOfflineCards(query: string, limit = 130): Promise<CardMaster[]> {
  const q = normalizeForSearch(query);
  if (!q) return [];

  let cards = await ensureMemoryCardsLoaded();

  // If IndexedDB does not have the full dictionary yet, fall back to searching cards currently in inventory
  if (cards.length === 0) {
    const inv = getCachedInventory();
    const seen = new Set<string>();
    const fallback: IndexedCard[] = [];
    for (const item of inv) {
      if (seen.has(item.card_id)) continue;
      seen.add(item.card_id);
      const alts = item.card_alt_names ? item.card_alt_names.split(' / ') : [];
      fallback.push({
        id: item.card_id,
        name: item.card_name,
        name_ruby: item.card_ruby || null,
        pack: item.card_pack,
        type: item.card_type,
        civil: item.card_civil,
        rarity: item.card_rarity,
        cost: item.card_cost,
        power: item.card_power,
        race: item.card_race,
        image: item.card_image,
        alt_names: item.card_alt_names,
        faces: item.card_faces_json ? JSON.parse(item.card_faces_json) : [],
        search_key: buildSearchKey([item.card_name, item.card_ruby, ...alts, item.card_pack, item.card_id, item.card_race]),
      });
    }
    cards = fallback;
  }

  const exactMarker = `|${q}|`;
  const prefixMarker = `|${q}`;

  const tier1: CardMaster[] = [];
  const tier2: CardMaster[] = [];
  const tier3: CardMaster[] = [];

  for (const c of cards) {
    if (!c.search_key.includes(q)) continue;
    if (c.search_key.includes(exactMarker)) {
      tier1.push(c);
    } else if (c.search_key.includes(prefixMarker)) {
      tier2.push(c);
    } else {
      tier3.push(c);
    }
    if (tier1.length + tier2.length + tier3.length >= limit * 3) {
      if (tier1.length >= limit) break;
    }
  }

  const sortFn = (a: CardMaster, b: CardMaster) => (a.cost ?? 9999) - (b.cost ?? 9999);
  tier1.sort(sortFn);
  tier2.sort(sortFn);
  tier3.sort(sortFn);

  return [...tier1, ...tier2, ...tier3].slice(0, limit);
}

// --- JSON Backup Export / Import in Local Mode ---

export function createLocalBackupObject(): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    storages: getCachedStorages(),
    inventory: getCachedInventory(),
  };
}

import preconstructedDecks from './preconstructedDecks.json';

export interface PreconstructedDeck {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  totalCards: number;
  uniqueCards: number;
  cards: Array<{ id: string; name: string; count: number }>;
}

export function searchDecksByQuery(query: string): PreconstructedDeck[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const results: PreconstructedDeck[] = [];
  for (const deck of preconstructedDecks as PreconstructedDeck[]) {
    const matched =
      normalizeForSearch(deck.name).includes(q) ||
      normalizeForSearch(deck.code).includes(q) ||
      deck.aliases.some((alias) => normalizeForSearch(alias).includes(q));
    if (matched) {
      results.push(deck);
    }
  }
  return results;
}

export function localAddDeckToStorage(
  storageId: number,
  deck: PreconstructedDeck
): { addedCount: number; typesCount: number } {
  const storages = getCachedStorages();
  const targetStorage = storages.find((s) => s.id === storageId) || storages[0];
  if (!targetStorage) throw new Error('ストレージが存在しません');

  const currentInventory = [...getCachedInventory()];
  const allCards = memoryCardsCache || [];
  let addedCount = 0;
  const now = new Date().toISOString();

  for (const deckCard of deck.cards) {
    const cardMaster = allCards.find((c) => c.id === deckCard.id);
    const existingIdx = currentInventory.findIndex(
      (i) => i.storage_id === targetStorage.id && i.card_id === deckCard.id && i.condition === 'プレイ用'
    );

    if (existingIdx >= 0) {
      currentInventory[existingIdx] = {
        ...currentInventory[existingIdx],
        count: currentInventory[existingIdx].count + deckCard.count,
        updated_at: now,
      };
    } else {
      const newId = currentInventory.reduce((max, i) => Math.max(max, i.id), 0) + 1;
      currentInventory.push({
        id: newId,
        storage_id: targetStorage.id,
        storage_name: targetStorage.name,
        storage_color: targetStorage.color,
        card_id: deckCard.id,
        card_name: cardMaster?.name || deckCard.name,
        card_ruby: cardMaster?.name_ruby || null,
        card_pack: cardMaster?.pack || '',
        card_type: cardMaster?.type || '',
        card_civil: cardMaster?.civil || '',
        card_rarity: cardMaster?.rarity || '',
        card_cost: cardMaster?.cost ?? null,
        card_power: cardMaster?.power || '',
        card_race: cardMaster?.race || '',
        card_image: cardMaster?.image || '',
        card_alt_names: cardMaster?.alt_names || null,
        card_faces_json: cardMaster?.faces ? JSON.stringify(cardMaster.faces) : null,
        count: deckCard.count,
        condition: 'プレイ用',
        memo: `構築済みデッキ [${deck.name}]`,
        updated_at: now,
      });
    }
    addedCount += deckCard.count;
  }

  saveStoragesAndInventoryToCache(storages, currentInventory, true);
  return { addedCount, typesCount: deck.cards.length };
}

export function importBackupToLocal(data: BackupData, mode: 'replace' | 'merge'): void {
  if (!data || !Array.isArray(data.storages) || !Array.isArray(data.inventory)) {
    throw new Error('バックアップデータの形式が正しくありません');
  }

  if (mode === 'replace') {
    saveStoragesAndInventoryToCache(data.storages, data.inventory, true);
    return;
  }

  // Merge mode
  const currentStorages = [...getCachedStorages()];
  const currentInventory = [...getCachedInventory()];
  const storageIdMap = new Map<number, number>();

  for (const incStorage of data.storages) {
    const existing = currentStorages.find((s) => s.name === incStorage.name);
    if (existing) {
      storageIdMap.set(incStorage.id, existing.id);
    } else {
      const newId = currentStorages.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      currentStorages.push({
        ...incStorage,
        id: newId,
      });
      storageIdMap.set(incStorage.id, newId);
    }
  }

  for (const incItem of data.inventory) {
    const mappedStorageId = storageIdMap.get(incItem.storage_id) || incItem.storage_id;
    const targetStorage = currentStorages.find((s) => s.id === mappedStorageId) || currentStorages[0];
    const existingIdx = currentInventory.findIndex(
      (i) => i.storage_id === targetStorage.id && i.card_id === incItem.card_id && i.condition === incItem.condition
    );
    if (existingIdx >= 0) {
      currentInventory[existingIdx] = {
        ...currentInventory[existingIdx],
        count: Math.max(currentInventory[existingIdx].count, incItem.count),
        updated_at: incItem.updated_at || currentInventory[existingIdx].updated_at,
      };
    } else {
      const newId = currentInventory.reduce((max, i) => Math.max(max, i.id), 0) + 1;
      currentInventory.push({
        ...incItem,
        id: newId,
        storage_id: targetStorage.id,
        storage_name: targetStorage.name,
        storage_color: targetStorage.color,
      });
    }
  }

  saveStoragesAndInventoryToCache(currentStorages, currentInventory, true);
}

