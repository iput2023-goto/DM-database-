/**
 * 検索用の文字列正規化（src/lib/normalize.ts と同じロジックを保つこと）
 */
function normalizeForSearch(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s・|「」『』【】"“”'’‘\-－―—–]+/g, '');
}

function buildSearchKey(parts) {
  const normalized = parts.map(normalizeForSearch).filter(Boolean);
  return '|' + normalized.join('|') + '|';
}

module.exports = { normalizeForSearch, buildSearchKey };

