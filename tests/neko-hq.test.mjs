import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { TOOLS } from '../src/dispatcher.mjs';
import { appendLog, readLogs, LOG_FILE } from '../src/log.mjs';

const BIN = join(import.meta.dirname, '..', 'bin', 'neko-hq.mjs');

// === TOOLS テーブル ===

test('TOOLS: 8ツール登録済み', () => {
  assert.equal(Object.keys(TOOLS).length, 8);
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
