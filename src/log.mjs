import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.neko-hq');
const LOG_FILE = join(LOG_DIR, 'stats.jsonl');

/**
 * ログエントリを stats.jsonl に追記する
 * @param {{ tool: string, command: string, ts: string, duration_ms: number, exit_code: number, meta: object }} entry
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
