// ツール別の設定ファイル表示（config.json / .env 等を一覧表示 / マスク表示）
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { TOOLS } from './dispatcher.mjs';
import { getWorkDir } from './constants.mjs';

// 各コマンドが保有する設定ファイルの一覧（空配列 = 設定なし）
const CONFIG_MAP = {
  health:  ['config.json'],
  license: ['config.json'],
  doctor:  [],
  secret:  ['.neko-not-yoshi-allow'],
  kensa:   [],
  release: [],
  pii:     [],
  rescue:  [],
};

export function showConfig(command) {
  if (!command) {
    return showAllConfigs();
  }

  const tool = TOOLS[command];
  if (!tool) {
    console.error('[neko-hq] 不明なコマンド: ' + command);
    return 1;
  }

  const pkgDir = resolve(getWorkDir(), tool.pkg);
  if (!existsSync(pkgDir)) {
    console.error('[neko-hq] ツール未検出: ' + pkgDir);
    return 1;
  }

  console.log('neko-HQ config: ' + command + ' (' + tool.pkg + ')');
  console.log('  Path: ' + pkgDir);

  const configFiles = CONFIG_MAP[command] || [];

  if (configFiles.length === 0) {
    console.log('  設定ファイル: なし');
    return 0;
  }

  for (const file of configFiles) {
    const filePath = resolve(pkgDir, file);
    console.log('');
    console.log('  [' + file + ']');

    if (!existsSync(filePath)) {
      console.log('  未作成');
      continue;
    }

    if (file === '.env' || file.endsWith('.env')) {
      showEnvMasked(filePath);
    } else {
      showFileContent(filePath);
    }
  }
  return 0;
}

function showAllConfigs() {
  console.log('neko-HQ config: 全ツール設定一覧');
  console.log('');

  for (const [cmd, tool] of Object.entries(TOOLS)) {
    const pkgDir = resolve(getWorkDir(), tool.pkg);
    const exists = existsSync(pkgDir);
    const configFiles = CONFIG_MAP[cmd] || [];
    const configs = configFiles.length > 0
      ? configFiles.map(f => {
          const fp = resolve(pkgDir, f);
          return f + (existsSync(fp) ? '' : ' (未作成)');
        }).join(', ')
      : 'なし';

    console.log(
      '  ' + cmd.padEnd(12) +
      (exists ? 'OK' : 'N/A').padEnd(6) +
      configs
    );
  }
  return 0;
}

function showEnvMasked(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        console.log('    ' + trimmed);
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        console.log('    ' + trimmed.slice(0, eq) + '=****');
      } else {
        console.log('    ' + trimmed);
      }
    }
  } catch {
    console.log('    (読み取り不可)');
  }
}

function showFileContent(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      console.log('    ' + line);
    }
  } catch {
    console.log('    (読み取り不可)');
  }
}
