const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apiDir = path.join(rootDir, 'src', 'app', 'api');
const apiBackupDir = path.join(rootDir, 'src', 'app', '_api_backup');
const dbSource = path.join(rootDir, 'dm_cards.db');
const dbDestDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'databases');
const dbDest = path.join(dbDestDir, 'dm_cards.db');

console.log('🚀 Building Android Assets (Next.js Static Export)...');

let apiRenamed = false;
try {
  // 1. 静的エクスポートエラーを回避するため api フォルダを一時退避
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, apiBackupDir);
    apiRenamed = true;
    console.log('📦 Temporarily disabled server API routes for static export.');
  }

  // 2. 静的エクスポートビルド実行
  console.log('⚙️ Running next build (output: export)...');
  execSync('npx next build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, NEXT_EXPORT: 'true' },
  });

  // 3. データベースファイルの確認とコピー
  if (fs.existsSync(dbSource)) {
    if (!fs.existsSync(dbDestDir)) {
      fs.mkdirSync(dbDestDir, { recursive: true });
    }
    fs.copyFileSync(dbSource, dbDest);
    console.log('💾 Copied dm_cards.db to Android assets/databases/.');
  }

  // 4. Capacitor の同期
  console.log('🔄 Syncing assets with Android project (cap sync)...');
  execSync('npx cap sync android', { cwd: rootDir, stdio: 'inherit' });

  console.log('\n✅ Android build & sync completed successfully!');
  console.log('👉 You can now run "npx cap open android" to launch Android Studio.');
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exitCode = 1;
} finally {
  // 必ず api フォルダを復元
  if (apiRenamed && fs.existsSync(apiBackupDir)) {
    fs.renameSync(apiBackupDir, apiDir);
    console.log('🔄 Restored server API routes.');
  }
}
