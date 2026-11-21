import fs from 'fs';
import path from 'path';
import https from 'https';
import Database from 'better-sqlite3';

const CACHE_DIR = path.join(process.cwd(), 'public', 'card-images');

export function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function getImageFilename(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.split('/');
  const last = parts[parts.length - 1]?.split('?')[0];
  if (!last || !/\.(jpg|jpeg|png|webp)$/i.test(last)) return null;
  return last;
}

export function isImageCached(url: string | null | undefined): boolean {
  const filename = getImageFilename(url);
  if (!filename) return false;
  return fs.existsSync(path.join(CACHE_DIR, filename));
}

export function downloadImageToCache(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const filename = getImageFilename(url);
    if (!filename || !url.startsWith('https://')) {
      resolve(false);
      return;
    }
    ensureCacheDir();
    const destPath = path.join(CACHE_DIR, filename);
    if (fs.existsSync(destPath)) {
      resolve(true);
      return;
    }

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(false);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            fs.writeFileSync(destPath, Buffer.concat(chunks));
            resolve(true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function cacheImagesForCard(db: Database.Database, cardId: string): Promise<void> {
  try {
    const row = db
      .prepare('SELECT image, faces_json FROM cards WHERE id = ?')
      .get(cardId) as { image: string | null; faces_json: string | null } | undefined;
    if (!row) return;

    const urls = new Set<string>();
    if (row.image) urls.add(row.image);
    if (row.faces_json) {
      try {
        const faces = JSON.parse(row.faces_json);
        if (Array.isArray(faces)) {
          for (const f of faces) {
            if (f && f.image) urls.add(f.image);
          }
        }
      } catch {}
    }

    for (const u of urls) {
      await downloadImageToCache(u);
    }
  } catch {
    // Ignore background cache errors
  }
}

