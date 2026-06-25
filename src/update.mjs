// 導入済みツールを git pull --ff-only で最新化する
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS } from './dispatcher.mjs';
import { appendLog } from './log.mjs';
import { getWorkDir } from './constants.mjs';

// 1ツール分の git pull を実行して結果を記録する（未導入ならスキップ）
function pullTool(name, tool) {
  const pkgDir = resolve(getWorkDir(), tool.pkg);
  if (!existsSync(pkgDir)) {
    console.log('  ' + name.padEnd(10) + '未導入 (skip)');
    return null;
  }

  const start = Date.now();
  let exitCode = 0;
  let summary = '';

  try {
    const out = execFileSync('git', ['pull', '--ff-only'], {
      cwd: pkgDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    summary = out.trim().includes('Already up to date')
      ? '最新'
      : '更新完了';
  } catch (err) {
    exitCode = err.status ?? 1;
    summary = '失敗: ' + (err.stderr || '').split('\n')[0];
  }

  const duration_ms = Date.now() - start;
  console.log('  ' + name.padEnd(10) + summary);

  appendLog({
    tool: tool.pkg,
    command: 'update',
    ts: new Date().toISOString(),
    duration_ms,
    exit_code: exitCode,
    meta: {},
  });

  return exitCode;
}

export function update(target) {
  if (target) {
    const tool = TOOLS[target];
    if (!tool) {
      console.error('[neko-hq] 不明なコマンド: ' + target);
      console.error('利用可能: ' + Object.keys(TOOLS).join(', '));
      return 1;
    }
    console.log('[neko-hq] update: ' + tool.pkg);
    const code = pullTool(target, tool);
    return code === null ? 1 : code;
  }

  console.log('[neko-hq] 全ツール更新中...');
  let hasError = false;
  for (const [name, tool] of Object.entries(TOOLS)) {
    const code = pullTool(name, tool);
    if (code !== null && code !== 0) hasError = true;
  }
  return hasError ? 1 : 0;
}
