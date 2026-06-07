import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendLog } from './log.mjs';
import { WORK_DIR } from './constants.mjs';

const TOOLS = {
  // 品質・防衛（neko系中核）
  doctor:  { pkg: 'neko-harness-doctor', bin: 'bin/neko-harness-doctor', desc: 'ハーネス診断' },
  secret:  { pkg: 'neko-not-yoshi',     bin: 'bin/neko-not-yoshi',     desc: '秘密検出' },
  kensa:   { pkg: 'neko-kensa',         bin: 'src/cli.mjs',           desc: '検査' },
  // 兵站（yoshi道具群）
  health:  { pkg: 'health-yoshi',       bin: 'bin/health-yoshi.mjs',  desc: 'サービスヘルスチェック' },
  release: { pkg: 'release-yoshi',      bin: 'bin/release-yoshi.mjs', desc: '自動リリース' },
  license: { pkg: 'license-yoshi',      bin: 'bin/license-yoshi.mjs', desc: 'ライセンスチェック' },
  pii:     { pkg: 'pii-mask-yoshi',     bin: 'index.mjs',            desc: 'PII マスキング' },
  rescue:  { pkg: 'yoshi',             bin: 'bin/yoshi.mjs',         prependArgs: ['rescue'], desc: 'レスキュー' },
};

export { TOOLS };

/**
 * コマンドをディスパッチして対応ツールを起動する
 * @param {string} command - ツール名
 * @param {string[]} args - 追加引数
 * @returns {number} exit code
 */
export function dispatch(command, args) {
  const tool = TOOLS[command];
  if (!tool) {
    console.error('[neko-hq] 不明なコマンド: ' + command);
    return 1;
  }

  const binPath = resolve(WORK_DIR, tool.pkg, tool.bin);
  if (!existsSync(binPath)) {
    console.error('[neko-hq] ツール未検出: ' + binPath);
    return 1;
  }

  const allArgs = [...(tool.prependArgs || []), ...args];
  const start = Date.now();
  let exitCode = 0;

  try {
    const output = execFileSync('node', [binPath, ...allArgs], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
      timeout: 60000,
    });
    process.stdout.write(output);
  } catch (err) {
    exitCode = err.status ?? 1;
    if (err.stdout) process.stdout.write(err.stdout);
  }

  const duration_ms = Date.now() - start;
  appendLog({
    tool: tool.pkg,
    command,
    ts: new Date().toISOString(),
    duration_ms,
    exit_code: exitCode,
    meta: {},
  });

  return exitCode;
}
