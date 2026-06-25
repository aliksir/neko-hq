// stats.jsonl の集計表示（ツール別実行回数/成功率/平均時間 + セキュリティイベント集計）
import { readLogs } from './log.mjs';

// 各ツール固有の重大度表現を統一ラベル（BLOCK/ERROR/WARN/INFO）へ正規化するマップ
const SEVERITY_NORMALIZE = {
  critical: 'BLOCK',
  high: 'ERROR',
  medium: 'WARN',
  low: 'INFO',
  none: 'INFO',
  block: 'BLOCK',
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
};

const CATEGORIES = {
  'pii-mask-yoshi': {
    label: 'PII',
    fields: ['masked', 'reports', 'cleanup_expired'],
  },
  'license-yoshi': {
    label: 'License',
    fields: ['forbidden', 'caution', 'expired_allowlist'],
  },
  'mcp-yoshi': {
    label: 'MCP',
    fields: ['blocked', 'warned', 'findings'],
  },
  'neko-not-yoshi': {
    label: 'Secret',
    fields: ['findings', 'blocked', 'warned'],
  },
  'health-yoshi': {
    label: 'Health',
    fields: ['total', 'unhealthy', 'notified'],
  },
};

/**
 * stats.jsonl を集計してツール別の実行統計を表示する
 */
export function showStats() {
  const logs = readLogs();

  if (logs.length === 0) {
    console.log('neko-HQ stats: ログなし');
    return;
  }

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

  const sevEntries = logs.filter(e => typeof e.severity === 'string' && e.severity);
  if (sevEntries.length > 0) {
    const bySev = {};
    for (const e of sevEntries) {
      const raw = e.severity.toLowerCase();
      const normalized = SEVERITY_NORMALIZE[raw] || raw.toUpperCase();
      bySev[normalized] = (bySev[normalized] || 0) + 1;
    }

    console.log('');
    console.log('Security Events');
    console.log('─'.repeat(60));
    for (const s of ['BLOCK', 'ERROR', 'WARN', 'INFO']) {
      if (bySev[s]) console.log('  ' + s.padEnd(10) + bySev[s]);
    }
    const others = Object.keys(bySev).filter(k => !['BLOCK', 'ERROR', 'WARN', 'INFO'].includes(k));
    for (const s of others) {
      console.log('  ' + s.padEnd(10) + bySev[s]);
    }
  }

  const sumEntries = logs.filter(e => e.summary);
  if (sumEntries.length > 0) {
    let findings = 0, blocked = 0, warned = 0, masked = 0;
    for (const e of sumEntries) {
      const sm = e.summary;
      findings += Number(sm.findings) || 0;
      blocked += Number(sm.blocked) || 0;
      warned += Number(sm.warned) || 0;
      masked += Number(sm.masked) || 0;
    }

    console.log('');
    console.log('Summary (accumulated)');
    console.log('─'.repeat(60));
    if (findings) console.log('  findings'.padEnd(14) + findings);
    if (blocked) console.log('  blocked'.padEnd(14) + blocked);
    if (warned) console.log('  warned'.padEnd(14) + warned);
    if (masked) console.log('  masked'.padEnd(14) + masked);
  }

  for (const [toolName, cat] of Object.entries(CATEGORIES)) {
    const toolEntries = logs.filter(e => e.tool === toolName && e.summary);
    if (toolEntries.length === 0) continue;

    const totals = {};
    for (const field of cat.fields) {
      totals[field] = 0;
    }
    for (const e of toolEntries) {
      for (const field of cat.fields) {
        totals[field] += Number(e.summary[field]) || 0;
      }
    }

    const hasValues = cat.fields.some(f => totals[f] > 0);
    if (!hasValues) continue;

    console.log('');
    console.log(cat.label + ' (' + toolName + ')');
    console.log('─'.repeat(60));
    for (const field of cat.fields) {
      if (totals[field] > 0) {
        console.log('  ' + field.padEnd(18) + totals[field]);
      }
    }
  }
}
