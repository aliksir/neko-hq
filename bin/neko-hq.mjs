#!/usr/bin/env node

import { dispatch, TOOLS } from '../src/dispatcher.mjs';

function showHelp() {
  console.log('neko-HQ v0.1.0 - 猫軍団エコシステム統合CLI');
  console.log('');
  console.log('Usage: neko-hq <command> [args...]');
  console.log('');
  console.log('Commands:');
  console.log('  status    全ツールの検出・稼働状況一覧');
  console.log('  checkup   ツール間の依存・関連設定の健全性チェック');
  console.log('  policy    .neko-policy/ ポリシーファイルの表示・検証');
  console.log('  stats     実行統計ダッシュボード');
  console.log('  install   ツール導入（git clone + npm install / --preset で一括）');
  console.log('  update    ツール更新（git pull --ff-only）');
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

  if (command === 'checkup') {
    const { runCheckup } = await import('../src/checkup.mjs');
    process.exit(runCheckup());
  }

  if (command === 'stats') {
    const { showStats } = await import('../src/stats.mjs');
    showStats();
    process.exit(0);
  }

  if (command === 'policy') {
    const sub = process.argv[3];
    if (sub === 'init') {
      const { initPolicy } = await import('../src/policy.mjs');
      const force = process.argv.includes('--force');
      process.exit(initPolicy(force));
    }
    const { showPolicy, validatePolicy } = await import('../src/policy.mjs');
    const code = showPolicy();
    const issues = validatePolicy();
    if (issues.length > 0) {
      console.log('検証結果:');
      for (const issue of issues) console.log(`  [WARN] ${issue}`);
      console.log('');
    }
    process.exit(code);
  }

  if (command === 'install') {
    const { install } = await import('../src/install.mjs');
    const target = process.argv[3];
    if (!target) { console.error('[neko-hq] 使い方: neko-hq install <tool|--preset name|--list-presets>'); process.exit(1); }
    const flags = process.argv.slice(4);
    process.exit(install(target, flags));
  }

  if (command === 'update') {
    const { update } = await import('../src/update.mjs');
    process.exit(update(process.argv[3]));
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
