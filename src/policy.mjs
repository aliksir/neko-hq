// セキュリティポリシー管理（~/.neko-policy/ 配下の JSON ポリシーファイルの読込/検証/初期化）
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ポリシーファイルの格納ディレクトリ（ユーザーホーム直下）
const POLICY_DIR = join(homedir(), '.neko-policy');

const EXPECTED_FILES = [
  'data-classification.json',
  'allowed-mcp-servers.json',
  'pii-retention.json',
  'license-policy.json',
  'ngwords-policy.json',
  'audit-log-policy.json',
];

function loadPolicy(filename) {
  const p = join(POLICY_DIR, filename);
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function showPolicy() {
  if (!existsSync(POLICY_DIR)) {
    console.log('[neko-hq] .neko-policy/ が見つかりません');
    console.log(`  場所: ${POLICY_DIR}`);
    return 1;
  }

  console.log('neko-HQ Policy Dashboard');
  console.log('='.repeat(60));
  console.log(`  ディレクトリ: ${POLICY_DIR}`);
  console.log('');

  let okCount = 0;
  let missingCount = 0;
  let errorCount = 0;

  for (const file of EXPECTED_FILES) {
    const policy = loadPolicy(file);
    if (policy === null) {
      console.log(`  [MISS] ${file}`);
      missingCount++;
    } else if (!policy.version) {
      console.log(`  [WARN] ${file} — version フィールドなし`);
      errorCount++;
    } else {
      console.log(`  [OK]   ${file} v${policy.version}`);
      okCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`  結果: OK=${okCount}  MISS=${missingCount}  WARN=${errorCount}`);
  console.log('');

  return missingCount > 0 || errorCount > 0 ? 1 : 0;
}

export function validatePolicy() {
  const issues = [];

  const piiRetention = loadPolicy('pii-retention.json');
  if (piiRetention) {
    if (piiRetention.token_map_retention_days > 365) {
      issues.push('pii-retention: token_map_retention_days が365日を超えています');
    }
    if (piiRetention.token_map_retention_days !== piiRetention.block_report_retention_days) {
      issues.push('pii-retention: token_map と block_report の保持日数が異なります（同時削除保証に影響）');
    }
  }

  const license = loadPolicy('license-policy.json');
  if (license) {
    const overlap = (license.allowed || []).filter(l => (license.forbidden || []).includes(l));
    if (overlap.length > 0) {
      issues.push(`license-policy: allowed と forbidden に重複があります: ${overlap.join(', ')}`);
    }
  }

  const mcpServers = loadPolicy('allowed-mcp-servers.json');
  if (mcpServers && mcpServers.servers) {
    const unapproved = Object.entries(mcpServers.servers)
      .filter(([, v]) => v.status !== 'approved')
      .map(([k]) => k);
    if (unapproved.length > 0) {
      issues.push(`allowed-mcp-servers: 未承認サーバー: ${unapproved.join(', ')}`);
    }
  }

  return issues;
}

const POLICY_DEFAULTS = {
  'pii-retention.json': {
    version: '1.0',
    token_map_retention_days: 90,
    block_report_retention_days: 90,
    auto_cleanup: true,
  },
  'allowed-mcp-servers.json': {
    version: '1.0',
    servers: {},
  },
  'license-policy.json': {
    version: '1.0',
    allowed: ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', 'Unlicense'],
    forbidden: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
    caution: ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0'],
  },
  'ngwords-policy.json': {
    version: '1.0',
    dictionaries: [],
    severity: 'block',
  },
  'data-classification.json': {
    version: '1.0',
    levels: ['public', 'internal', 'confidential', 'restricted'],
    default_level: 'internal',
  },
  'audit-log-policy.json': {
    version: '1.0',
    retention_days: 365,
    siem_export: false,
    siem_format: 'jsonl',
  },
};

export function initPolicy(force = false) {
  if (!existsSync(POLICY_DIR)) {
    mkdirSync(POLICY_DIR, { recursive: true });
  }

  let created = 0;
  let skipped = 0;
  let overwritten = 0;

  console.log('neko-HQ Policy Init');
  console.log('='.repeat(60));

  for (const [file, content] of Object.entries(POLICY_DEFAULTS)) {
    const filePath = join(POLICY_DIR, file);
    if (existsSync(filePath) && !force) {
      console.log('  [EXISTS]    ' + file);
      skipped++;
    } else {
      const label = existsSync(filePath) ? 'OVERWRITE' : 'CREATED';
      writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
      console.log('  [' + label + '] ' + file);
      if (label === 'OVERWRITE') overwritten++;
      else created++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('  created=' + created + '  exists=' + skipped + '  overwrite=' + overwritten);
  console.log('  場所: ' + POLICY_DIR);
  return 0;
}

export function getPolicyDir() {
  return POLICY_DIR;
}
