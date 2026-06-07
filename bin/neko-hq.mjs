#!/usr/bin/env node

import { dispatch, TOOLS } from '../src/dispatcher.mjs';

function showHelp() {
  console.log('neko-HQ v0.1.0 - 猫軍団エコシステム統合CLI');
  console.log('');
  console.log('Usage: neko-hq <command> [args...]');
  console.log('');
  console.log('Commands:');
  console.log('  status    全ツールの検出・稼働状況一覧');
  console.log('  stats     実行統計ダッシュボード');
  console.log('  install   ツール導入（git clone + npm install）');
  console.log('  config    ツール設定確認・一覧');
  console.log('  uninstall ツール退避（_deleted/ に移動）');
  console.log('');
  console.log('Tools:');
  for (const [name, tool] of Object.entries(TOOLS)) {
    console.log('  ' + name.padEnd(10) + tool.desc);
  }
  console.log('');
  console.log('Options:');
  console.log('  --help    このヘルプを表示');
}

try {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  if (command === 'status') {
    const { showStatus } = await import('../src/status.mjs');
    showStatus();
    process.exit(0);
  }

  if (command === 'stats') {
    const { showStats } = await import('../src/stats.mjs');
    showStats();
    process.exit(0);
  }

  if (command === 'install') {
    const { install } = await import('../src/install.mjs');
    const target = process.argv[3];
    if (!target) { console.error('[neko-hq] 使い方: neko-hq install <tool>'); process.exit(1); }
    process.exit(install(target));
  }

  if (command === 'config') {
    const { showConfig } = await import('../src/config.mjs');
    process.exit(showConfig(process.argv[3]));
  }

  if (command === 'uninstall') {
    const { uninstall } = await import('../src/uninstall.mjs');
    const target = process.argv[3];
    if (!target) { console.error('[neko-hq] 使い方: neko-hq uninstall <tool>'); process.exit(1); }
    process.exit(uninstall(target));
  }

  const args = process.argv.slice(3);
  const code = dispatch(command, args);
  process.exit(code);
} catch (err) {
  console.error('[neko-hq] エラー: ' + err.message);
  process.exit(1);
}
