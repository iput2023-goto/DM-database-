import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';

export async function GET() {
  try {
    const db = getDb();
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM cards').get() as { c: number };
    
    const states = db.prepare('SELECT key, value FROM sync_state').all() as { key: string; value: string }[];
    const stateMap: Record<string, string> = {};
    for (const s of states) {
      stateMap[s.key] = s.value;
    }

    return NextResponse.json({
      dbCardsCount: totalCards.c,
      isSyncing: stateMap.is_syncing === 'true',
      scannedPages: parseInt(stateMap.scanned_pages || '0', 10),
      totalPages: parseInt(stateMap.total_pages || '481', 10),
      totalIdsFound: parseInt(stateMap.total_ids_found || '0', 10),
      progressPercent: parseInt(stateMap.sync_progress_percent || '0', 10),
      lastSyncCompletedAt: stateMap.last_sync_completed_at || null,
      error: stateMap.sync_error || null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'sync_all_cards.js');
    const child = spawn(process.execPath, [scriptPath, '481'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return NextResponse.json({ success: true, message: 'カード同期を開始しました' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

