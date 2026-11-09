/**
 * 検索用の文字列正規化。
 * - NFKC（全角英数・全角スペース・半角カナなどを統一）
 * - 小文字化
 * - ひらがな → カタカナ
 * - 空白・中黒（・）・区切り文字 | を除去
 * ※ scripts/normalize.js と同じロジックを保つこと
 */
export function normalizeForSearch(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s・|「」『』【】"“”'’‘\-－―—–]+/g, '');
}

/** カードの全面の名前・型番・ID・種族を連結した検索キーを作る（|name|alt|pack|id|race| 形式） */
export function buildSearchKey(parts: (string | null | undefined)[]): string {
  const normalized = parts.map(normalizeForSearch).filter(Boolean);
  return '|' + normalized.join('|') + '|';
}

