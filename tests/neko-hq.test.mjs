import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

process.env.NEKO_HQ_WORK_DIR = resolve(import.meta.dirname, '..', '..');

import { TOOLS } from '../src/dispatcher.mjs';
import { appendLog, readLogs, LOG_FILE } from '../src/log.mjs';

const BIN = join(import.meta.dirname, '..', 'bin', 'neko-hq.mjs');

// === TOOLS テーブル ===

test('TOOLS: 10ツール登録済み', () => {
  assert.equal(Object.keys(TOOLS).length, 10);
});

test('TOOLS: 必須フィールド（pkg, bin, desc）', () => {
  for (const [name, tool] of Object.entries(TOOLS)) {
    assert.ok(tool.pkg, name + '.pkg が未定義');
    assert.ok(tool.bin, name + '.bin が未定義');
    assert.ok(tool.desc, name + '.desc が未定義');
  }
});

// === log.mjs: appendLog + readLogs ラウンドトリップ ===

test('appendLog + readLogs: 実関数でラウンドトリップ', () => {
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    const entry = {
      tool: 'test-tool',
      command: 'test',
      ts: '2026-01-01T00:00:00.000Z',
      duration_ms: 42,
      exit_code: 0,
      meta: { test: true },
    };
    appendLog(entry);
    const logs = readLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].tool, 'test-tool');
    assert.equal(logs[0].duration_ms, 42);
    assert.deepEqual(logs[0].meta, { test: true });
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

test('readLogs: ファイル未存在で空配列', () => {
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    const logs = readLogs();
    assert.deepEqual(logs, []);
  } finally {
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

// === CLI 統合テスト ===

test('CLI: --help で正常終了 + 全コマンド表示', () => {
  const out = execFileSync('node', [BIN, '--help'], { encoding: 'utf8' });
  assert.match(out, /neko-HQ/);
  assert.match(out, /install/);
  assert.match(out, /update/);
  assert.match(out, /config/);
  assert.match(out, /uninstall/);
  assert.match(out, /status/);
  assert.match(out, /stats/);
});

test('CLI: 引数なしでヘルプ表示', () => {
  const out = execFileSync('node', [BIN], { encoding: 'utf8' });
  assert.match(out, /Usage:/);
});

test('CLI: status で全ツール表示', () => {
  const out = execFileSync('node', [BIN, 'status'], { encoding: 'utf8' });
  assert.match(out, /neko-HQ status/);
  assert.match(out, /doctor/);
  assert.match(out, /health/);
  assert.match(out, /rescue/);
});

test('CLI: stats で集計表示', () => {
  const out = execFileSync('node', [BIN, 'stats'], { encoding: 'utf8' });
  assert.match(out, /neko-HQ stats/);
});

test('CLI: config で全ツール設定一覧', () => {
  const out = execFileSync('node', [BIN, 'config'], { encoding: 'utf8' });
  assert.match(out, /全ツール設定一覧/);
  assert.match(out, /health/);
});

test('CLI: config health で詳細表示', () => {
  const out = execFileSync('node', [BIN, 'config', 'health'], { encoding: 'utf8' });
  assert.match(out, /health-yoshi/);
  assert.match(out, /config\.json/);
});

test('CLI: 不明コマンドで exit 1', () => {
  try {
    execFileSync('node', [BIN, 'nonexistent'], { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('exit 0 で終了してはいけない');
  } catch (err) {
    assert.equal(err.status, 1);
    assert.match(err.stderr, /不明なコマンド/);
  }
});

test('CLI: install 引数なしで exit 1', () => {
  try {
    execFileSync('node', [BIN, 'install'], { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('exit 0 で終了してはいけない');
  } catch (err) {
    assert.equal(err.status, 1);
    assert.match(err.stderr, /使い方/);
  }
});

test('CLI: install health で「導入済み」表示 + exit 0', () => {
  const out = execFileSync('node', [BIN, 'install', 'health'], { encoding: 'utf8', stdio: 'pipe' });
  assert.match(out, /導入済み/);
});

test('CLI: uninstall 引数なしで exit 1', () => {
  try {
    execFileSync('node', [BIN, 'uninstall'], { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('exit 0 で終了してはいけない');
  } catch (err) {
    assert.equal(err.status, 1);
  }
});

// === uninstall ユニットテスト ===

import { uninstall } from '../src/uninstall.mjs';

test('uninstall: 不明コマンドで exit 1', () => {
  const code = uninstall('nonexistent');
  assert.equal(code, 1);
});

test('CLI: install 不明ツールで exit 1', () => {
  try {
    execFileSync('node', [BIN, 'install', 'nonexistent'], { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('exit 0 で終了してはいけない');
  } catch (err) {
    assert.equal(err.status, 1);
  }
});

// === update テスト ===

import { update } from '../src/update.mjs';

test('update: 不明コマンドで exit 1', () => {
  const code = update('nonexistent');
  assert.equal(code, 1);
});

test('update: 引数なしで全ツール更新（クラッシュしない）', () => {
  const code = update();
  // git pull --ff-only は diverged branch 環境で非ゼロを返す場合がある
  assert.equal(typeof code, 'number');
});

test('update: 導入済みツールでクラッシュしない', () => {
  const code = update('health');
  assert.equal(typeof code, 'number');
});

test('CLI: update で --help に表示', () => {
  const out = execFileSync('node', [BIN, '--help'], { encoding: 'utf8' });
  assert.match(out, /update/);
});

// === Schema v1.1 テスト ===

test('v1.1: 拡張フィールド付きエントリのラウンドトリップ', () => {
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    const entry = {
      schema_version: '1.1',
      tool: 'mcp-yoshi',
      command: 'outbound',
      ts: '2026-06-08T00:00:00.000Z',
      duration_ms: 45,
      exit_code: 0,
      severity: 'block',
      summary: { findings: 3, blocked: 1, warned: 0, masked: 0 },
      meta: {},
    };
    appendLog(entry);
    const logs = readLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].schema_version, '1.1');
    assert.equal(logs[0].severity, 'block');
    assert.equal(logs[0].summary.findings, 3);
    assert.equal(logs[0].summary.blocked, 1);
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

test('v1.1: v1.0 と v1.1 混在で showStats が例外を投げない', async () => {
  const { showStats } = await import('../src/stats.mjs');
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    appendLog({ tool: 'health-yoshi', command: 'health', ts: '2026-06-08T00:00:00Z', duration_ms: 100, exit_code: 0, meta: {} });
    appendLog({ schema_version: '1.1', tool: 'mcp-yoshi', command: 'scan', ts: '2026-06-08T00:01:00Z', duration_ms: 50, exit_code: 0, severity: 'warn', summary: { findings: 2, blocked: 0, warned: 2, masked: 0 }, meta: {} });
    assert.doesNotThrow(() => showStats());
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

test('v1.1: severity が非文字列でも stats が壊れない', async () => {
  const { showStats } = await import('../src/stats.mjs');
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    appendLog({ tool: 'test', command: 'test', ts: '2026-01-01T00:00:00Z', duration_ms: 1, exit_code: 0, severity: 123, meta: {} });
    appendLog({ tool: 'test', command: 'test', ts: '2026-01-01T00:00:00Z', duration_ms: 1, exit_code: 0, severity: true, meta: {} });
    assert.doesNotThrow(() => showStats());
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

test('v1.1: rescue ツールが neko-rescue を参照', () => {
  assert.equal(TOOLS.rescue.pkg, 'neko-rescue');
  assert.equal(TOOLS.rescue.bin, 'bin/neko-rescue.mjs');
  assert.equal(TOOLS.rescue.prependArgs, undefined);
});

// === カテゴリ別集計テスト ===

test('stats: カテゴリ別集計が表示される', async () => {
  const { showStats } = await import('../src/stats.mjs');
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    appendLog({ schema_version: '1.1', tool: 'pii-mask-yoshi', command: 'session', ts: '2026-06-08T00:00:00Z', duration_ms: 100, exit_code: 0, severity: 'info', summary: { findings: 5, blocked: 0, masked: 10, reports: 2, cleanup_expired: 1 } });
    appendLog({ schema_version: '1.1', tool: 'license-yoshi', command: 'check', ts: '2026-06-08T00:01:00Z', duration_ms: 200, exit_code: 1, severity: 'block', summary: { forbidden: 1, caution: 3, allowed: 20, expired_allowlist: 0 } });
    appendLog({ schema_version: '1.1', tool: 'mcp-yoshi', command: 'outbound', ts: '2026-06-08T00:02:00Z', duration_ms: 50, exit_code: 1, severity: 'block', summary: { server: 'test-mcp', findings: 2, blocked: 1, warned: 0 } });
    appendLog({ schema_version: '1.1', tool: 'neko-not-yoshi', command: 'scan', ts: '2026-06-08T00:03:00Z', duration_ms: 300, exit_code: 0, severity: 'info', summary: { findings: 0, blocked: 0, warned: 0 } });
    appendLog({ schema_version: '1.1', tool: 'health-yoshi', command: 'check', ts: '2026-06-08T00:04:00Z', duration_ms: 500, exit_code: 1, severity: 'warn', summary: { total: 5, healthy: 3, unhealthy: 2, notified: 1 } });

    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(msg);
    try {
      showStats();
    } finally {
      console.log = origLog;
    }

    const output = lines.join('\n');
    assert.match(output, /PII \(pii-mask-yoshi\)/);
    assert.match(output, /masked\s+10/);
    assert.match(output, /reports\s+2/);
    assert.match(output, /License \(license-yoshi\)/);
    assert.match(output, /forbidden\s+1/);
    assert.match(output, /caution\s+3/);
    assert.match(output, /MCP \(mcp-yoshi\)/);
    assert.match(output, /Health \(health-yoshi\)/);
    assert.match(output, /unhealthy\s+2/);
    assert.match(output, /notified\s+1/);
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

test('stats: 値がゼロのカテゴリは非表示', async () => {
  const { showStats } = await import('../src/stats.mjs');
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    appendLog({ schema_version: '1.1', tool: 'neko-not-yoshi', command: 'scan', ts: '2026-06-08T00:00:00Z', duration_ms: 100, exit_code: 0, severity: 'info', summary: { findings: 0, blocked: 0, warned: 0 } });

    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(msg);
    try {
      showStats();
    } finally {
      console.log = origLog;
    }

    const output = lines.join('\n');
    assert.ok(!output.includes('Secret (neko-not-yoshi)'));
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

test('stats: severity 旧値（critical/high）が正規化される', async () => {
  const { showStats } = await import('../src/stats.mjs');
  const backup = LOG_FILE + '.bak-' + Date.now();
  const hadFile = existsSync(LOG_FILE);
  if (hadFile) renameSync(LOG_FILE, backup);

  try {
    appendLog({ tool: 'pii-mask-yoshi', command: 'session', ts: '2026-06-08T00:00:00Z', duration_ms: 100, exit_code: 0, severity: 'critical' });
    appendLog({ tool: 'pii-mask-yoshi', command: 'session', ts: '2026-06-08T00:01:00Z', duration_ms: 100, exit_code: 0, severity: 'high' });
    appendLog({ tool: 'pii-mask-yoshi', command: 'session', ts: '2026-06-08T00:02:00Z', duration_ms: 100, exit_code: 0, severity: 'block' });

    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(msg);
    try {
      showStats();
    } finally {
      console.log = origLog;
    }

    const output = lines.join('\n');
    assert.match(output, /BLOCK\s+2/);
    assert.match(output, /ERROR\s+1/);
  } finally {
    if (existsSync(LOG_FILE)) rmSync(LOG_FILE);
    if (existsSync(backup)) renameSync(backup, LOG_FILE);
  }
});

// === policy init テスト ===

test('policy init: サンプルファイル生成', async () => {
  const { initPolicy, getPolicyDir } = await import('../src/policy.mjs');
  const policyDir = getPolicyDir();
  const testDir = policyDir + '-test-' + Date.now();
  const origDir = existsSync(policyDir);
  if (origDir) renameSync(policyDir, testDir);

  try {
    initPolicy(false);
    const files = readdirSync(policyDir);
    assert.ok(files.includes('pii-retention.json'));
    assert.ok(files.includes('license-policy.json'));
    assert.ok(files.includes('allowed-mcp-servers.json'));
    assert.ok(files.includes('ngwords-policy.json'));
    assert.ok(files.includes('data-classification.json'));
    assert.ok(files.includes('audit-log-policy.json'));
    assert.equal(files.length, 6);

    const pii = JSON.parse(readFileSync(join(policyDir, 'pii-retention.json'), 'utf8'));
    assert.equal(pii.version, '1.0');
    assert.equal(pii.token_map_retention_days, 90);
  } finally {
    if (existsSync(policyDir)) rmSync(policyDir, { recursive: true });
    if (existsSync(testDir)) renameSync(testDir, policyDir);
  }
});

test('policy init: 既存ファイルスキップ', async () => {
  const { initPolicy, getPolicyDir } = await import('../src/policy.mjs');
  const policyDir = getPolicyDir();
  const testDir = policyDir + '-test-' + Date.now();
  const origDir = existsSync(policyDir);
  if (origDir) renameSync(policyDir, testDir);

  try {
    mkdirSync(policyDir, { recursive: true });
    writeFileSync(join(policyDir, 'pii-retention.json'), '{"version":"0.9","custom":true}\n', 'utf8');

    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(msg);
    try {
      initPolicy(false);
    } finally {
      console.log = origLog;
    }

    const output = lines.join('\n');
    assert.match(output, /\[EXISTS\]\s+pii-retention\.json/);

    const pii = JSON.parse(readFileSync(join(policyDir, 'pii-retention.json'), 'utf8'));
    assert.equal(pii.version, '0.9');
    assert.equal(pii.custom, true);
  } finally {
    if (existsSync(policyDir)) rmSync(policyDir, { recursive: true });
    if (existsSync(testDir)) renameSync(testDir, policyDir);
  }
});

test('policy init --force: 既存ファイル上書き', async () => {
  const { initPolicy, getPolicyDir } = await import('../src/policy.mjs');
  const policyDir = getPolicyDir();
  const testDir = policyDir + '-test-' + Date.now();
  const origDir = existsSync(policyDir);
  if (origDir) renameSync(policyDir, testDir);

  try {
    mkdirSync(policyDir, { recursive: true });
    writeFileSync(join(policyDir, 'pii-retention.json'), '{"version":"0.9"}\n', 'utf8');

    initPolicy(true);

    const pii = JSON.parse(readFileSync(join(policyDir, 'pii-retention.json'), 'utf8'));
    assert.equal(pii.version, '1.0');
    assert.equal(pii.token_map_retention_days, 90);
  } finally {
    if (existsSync(policyDir)) rmSync(policyDir, { recursive: true });
    if (existsSync(testDir)) renameSync(testDir, policyDir);
  }
});

test('CLI: policy init でサブコマンド実行', () => {
  const out = execFileSync('node', [BIN, 'policy', 'init', '--force'], { encoding: 'utf8' });
  assert.match(out, /Policy Init/);
});
