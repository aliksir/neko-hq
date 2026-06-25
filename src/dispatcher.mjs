import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendLog } from './log.mjs';
import { getWorkDir } from './constants.mjs';

const TOOLS = {
  // 猫軍団本体
  gundan:  { pkg: 'multi-agent-neko',   bin: 'scripts/check-update.sh', desc: '猫軍団マルチエージェントシステム（本隊）' },
  // 品質・防衛（neko系中核）
  doctor:  { pkg: 'neko-harness-doctor', bin: 'bin/neko-harness-doctor', desc: 'CLAUDE.md/hooks/settings の25項目診断' },
  secret:  { pkg: 'neko-not-yoshi',     bin: 'bin/neko-not-yoshi',     desc: 'PII・顧客名・秘密情報のpush前検出' },
  kensa:   { pkg: 'neko-kensa',         bin: 'src/cli.mjs',           desc: 'デッドコード・循環依存・構造品質検査' },
  // 通信・監視
  mcp:     { pkg: 'mcp-yoshi',          bin: 'bin/mcp-yoshi.js',      desc: 'MCP通信の監視・フィルタ・SIEM出力' },
  // 兵站（yoshi道具群）
  health:  { pkg: 'health-yoshi',       bin: 'bin/health-yoshi.mjs',  desc: 'ローカルサービス死活監視+Telegram通知' },
  release: { pkg: 'release-yoshi',      bin: 'bin/release-yoshi.mjs', desc: 'version bump検出→git tag→GitHub Release' },
  license: { pkg: 'license-yoshi',      bin: 'bin/license-yoshi.mjs', desc: '依存パッケージのライセンス判定(GPL汚染防止)' },
  pii:     { pkg: 'pii-mask-yoshi',     bin: 'index.mjs',            desc: 'ファイル読取時のPII自動マスク(MCPサーバー)' },
  rescue:  { pkg: 'neko-rescue',        bin: 'bin/neko-rescue.mjs',   desc: '壊れたClaude Codeセッションの復旧' },
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

  const binPath = resolve(getWorkDir(), tool.pkg, tool.bin);
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
  const entry = {
    schema_version: '1.1',
    tool: tool.pkg,
    command,
    ts: new Date().toISOString(),
    duration_ms,
    exit_code: exitCode,
    meta: {},
  };
  if (exitCode !== 0) entry.severity = 'error';
  appendLog(entry);

  return exitCode;
}
