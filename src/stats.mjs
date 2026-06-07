import { readLogs } from './log.mjs';

/**
 * stats.jsonl を集計してツール別の実行統計を表示する
 */
export function showStats() {
  const logs = readLogs();

  if (logs.length === 0) {
    console.log('neko-HQ stats: ログなし');
    return;
  }

  // ツール別集計
  const byTool = {};
  for (const entry of logs) {
    const key = entry.command || entry.tool || 'unknown';
    if (!byTool[key]) {
      byTool[key] = { total: 0, success: 0, totalDuration: 0 };
    }
    byTool[key].total++;
    if (entry.exit_code === 0) byTool[key].success++;
    byTool[key].totalDuration += (entry.duration_ms || 0);
  }

  console.log('neko-HQ stats');
  console.log('─'.repeat(60));
  console.log(
    '  ' + 'Command'.padEnd(12) +
    'Runs'.padEnd(8) +
    'Success'.padEnd(10) +
    'Avg(ms)'
  );
  console.log('─'.repeat(60));

  for (const [name, s] of Object.entries(byTool)) {
    const rate = s.total > 0
      ? Math.round((s.success / s.total) * 100) + '%'
      : '-';
    const avg = s.total > 0
      ? Math.round(s.totalDuration / s.total)
      : 0;
    console.log(
      '  ' + name.padEnd(12) +
      String(s.total).padEnd(8) +
      rate.padEnd(10) +
      String(avg)
    );
  }
  console.log('─'.repeat(60));
  console.log('  Total: ' + logs.length + ' entries');
}
