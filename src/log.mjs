import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.neko-hq');
const LOG_FILE = join(LOG_DIR, 'stats.jsonl');

/**
 * ログエントリを stats.jsonl に追記する
 *
 * Schema v1.1 — 基本フィールド（必須）+ 拡張フィールド（任意）
 *
 * @param {object} entry
 * @param {string} entry.tool - パッケージ名
 * @param {string} entry.command - コマンド名
 * @param {string} entry.ts - ISO 8601 タイムスタンプ
 * @param {number} entry.duration_ms - 実行時間（ミリ秒）
 * @param {number} entry.exit_code - 終了コード（0=成功）
 * @param {string} [entry.schema_version] - "1.1"（未指定は "1.0" 扱い）
 * @param {string} [entry.severity] - "info" | "warn" | "error" | "block"
 * @param {string} [entry.session_id] - セッション識別子
 * @param {string} [entry.project] - プロジェクト名
 * @param {object} [entry.summary] - ツール固有の集約情報
 * @param {number} [entry.summary.findings] - 検出件数
 * @param {number} [entry.summary.blocked] - ブロック件数
 * @param {number} [entry.summary.warned] - 警告件数
 * @param {number} [entry.summary.masked] - マスク件数
 * @param {object} [entry.meta] - 自由形式メタデータ
 */
export function appendLog(entry) {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * stats.jsonl を読み込んでエントリ配列で返す
 * ファイル未存在 -> 空配列、パースエラー行はスキップ
 * @returns {Array<object>}
 */
export function readLogs() {
  if (!existsSync(LOG_FILE)) {
    return [];
  }
  const content = readFileSync(LOG_FILE, 'utf8');
  const lines = content.split('\n');
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // パースエラー行はスキップ
    }
  }
  return entries;
}

export { LOG_DIR, LOG_FILE };
