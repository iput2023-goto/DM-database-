const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apiDir = path.join(rootDir, 'src', 'app', 'api');
const apiBackupDir = path.join(rootDir, 'src', 'app', '_api_backup');
const dbSource = path.join(rootDir, 'dm_cards.db');

// Capacitor SQLite が Android で参照するパスは "public/assets/databases/dm_cards.db"
const publicAssetsDbDir = path.join(rootDir, 'public', 'assets', 'databases');
const androidPublicDbDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public', 'assets', 'databases');
const androidAssetsDbDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'databases');

function ensureDbCopied() {
  if (!fs.existsSync(dbSource)) return;

  const targets = [
    publicAssetsDbDir,
    androidPublicDbDir,
    androidAssetsDbDir,
  ];

  for (const dir of targets) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const dest = path.join(dir, 'dm_cards.db');
    fs.copyFileSync(dbSource, dest);
    console.log(`💾 Synced dm_cards.db -> ${path.relative(rootDir, dest)}`);
  }
}

console.log('🚀 Building Android Assets (Next.js Static Export)...');

let apiRenamed = false;
try {
  // 0. 事前に public/assets/databases に DB を配置
  ensureDbCopied();

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

  // 3. Capacitor の同期
  console.log('🔄 Syncing assets with Android project (cap sync)...');
  execSync('npx cap sync android', { cwd: rootDir, stdio: 'inherit' });

  // 4. Capacitor sync 後に再度確実に DB を同期
  ensureDbCopied();

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
