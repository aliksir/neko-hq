import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS } from './dispatcher.mjs';
import { appendLog } from './log.mjs';
import { WORK_DIR } from './constants.mjs';

const GITHUB_OVERRIDES = {
  'multi-agent-neko': 'neko-gundan',
  'playwright-browser-mcp': 'secure-browser-mcp',
};

export function install(command) {
  const tool = TOOLS[command];
  if (!tool) {
    console.error('[neko-hq] 不明なコマンド: ' + command);
    console.error('利用可能: ' + Object.keys(TOOLS).join(', '));
    return 1;
  }

  const pkgDir = resolve(WORK_DIR, tool.pkg);
  if (existsSync(pkgDir)) {
    console.log('[neko-hq] ' + tool.pkg + ' は既に導入済み: ' + pkgDir);
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
