export interface StorageItem {
  id: number;
  name: string;
  color: string;
  memo?: string;
  total_cards: number;
  unique_cards: number;
}

export interface CardFace {
  name: string;
  ruby?: string;
  pack: string;
  type: string;
  civil: string;
  rarity: string;
  cost: number | null;
  power: string;
  race: string;
  image: string;
}

export interface CardMaster {
  id: string;
  name: string;
  /** カード名のフリガナ・ルビ（例: パーフェクト・ペテンシー） */
  name_ruby?: string | null;
  pack: string;
  type: string;
  civil: string;
  rarity: string;
  cost: number | null;
  power: string;
  race: string;
  image: string;
  /** 裏面・覚醒面などの別名（" / " 区切り） */
  alt_names: string | null;
  /** 全面の情報（表面が先頭） */
  faces: CardFace[];
}

export interface InventoryItem {
  id: number;
  storage_id: number;
  storage_name: string;
  storage_color: string;
  card_id: string;
  card_name: string;
  card_ruby?: string | null;
  card_pack: string;
  card_type: string;
  card_civil: string;
  card_rarity: string;
  card_cost: number | null;
  card_power: string;
  card_race: string;
  card_image: string;
  card_alt_names: string | null;
  card_faces_json: string | null;
  count: number;
  condition: string;
  memo: string;
  updated_at: string;
}

