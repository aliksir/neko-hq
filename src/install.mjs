// 指定ツールまたはプリセットを GitHub からクローンして npm install まで実行するインストーラ
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS } from './dispatcher.mjs';
import { appendLog } from './log.mjs';
import { getWorkDir } from './constants.mjs';
import { getPresetTools, listPresets } from './presets.mjs';

// ローカルパッケージ名と GitHub リポジトリ名が異なるツールのマッピング
const GITHUB_OVERRIDES = {
  'multi-agent-neko': 'neko-gundan',
  'playwright-browser-mcp': 'secure-browser-mcp',
};

// 単一ツールのインストール処理
function installOne(name) {
  const tool = TOOLS[name];
  if (!tool) {
    console.error('[neko-hq] 不明なツール: ' + name);
    return 1;
  }

  const pkgDir = resolve(getWorkDir(), tool.pkg);
  if (existsSync(pkgDir)) {
    console.log('[neko-hq] ' + tool.pkg + ' は既に導入済み（スキップ）');
    return 0;
  }

  const githubName = GITHUB_OVERRIDES[tool.pkg] || tool.pkg;
  const cloneUrl = 'https://github.com/aliksir/' + githubName + '.git';

  console.log('[neko-hq] クローン中: ' + cloneUrl);
  const start = Date.now();
  let exitCode = 0;

  try {
    execFileSync('git', ['clone', cloneUrl, pkgDir], {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 120000,
    });
  } catch (err) {
    console.error('[neko-hq] git clone 失敗: ' + (err.message || ''));
    exitCode = 1;
  }

  if (exitCode === 0 && existsSync(resolve(pkgDir, 'package.json'))) {
    console.log('[neko-hq] npm install 実行中...');
    try {
      execFileSync('npm', ['install', '--prefix', pkgDir], {
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 120000,
        shell: true,
      });
    } catch (err) {
      console.error('[neko-hq] npm install 警告: ' + (err.message || ''));
    }
  }

  appendLog({
    tool: tool.pkg,
    command: 'install',
    ts: new Date().toISOString(),
    duration_ms: Date.now() - start,
    exit_code: exitCode,
    meta: { github: cloneUrl },
  });

  if (exitCode === 0) {
    console.log('[neko-hq] ' + tool.pkg + ' 導入完了');
  }
  return exitCode;
}

// プリセットまたは単一ツールのインストール
export function install(target, flags) {
  // --list-presets: プリセット一覧表示
  if (target === '--list-presets' || flags.includes('--list-presets')) {
    listPresets();
    return 0;
  }

  // --preset <name>: プリセット一括導入
  if (target === '--preset') {
    const name = flags[0];
    const tools = name ? getPresetTools(name) : null;
    if (!tools) {
      console.error('[neko-hq] 不明なプリセット: ' + (name || '(未指定)'));
      listPresets();
      return 1;
    }
    console.log('[neko-hq] プリセット「' + name + '」を導入します（' + tools.length + 'ツール）');
    console.log('');
    let failed = 0;
    for (const t of tools) {
      const code = installOne(t);
      if (code !== 0) failed++;
    }
    console.log('');
    console.log('[neko-hq] プリセット「' + name + '」完了: ' + (tools.length - failed) + '/' + tools.length + ' 成功');
    return failed > 0 ? 1 : 0;
  }

  // 単一ツール指定
  return installOne(target);
}
