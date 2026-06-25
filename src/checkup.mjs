// ツール間の依存関係チェック（推奨/必須/任意の外部バイナリ・環境変数も確認）
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { TOOLS } from './dispatcher.mjs';
import { getWorkDir } from './constants.mjs';
import { validatePolicy, getPolicyDir } from './policy.mjs';

// 各ツールが依存する外部ツール・環境変数・他 neko ツールの一覧
const RELATIONS = {
  pii: [
    { type: 'tool', target: 'secret', kind: 'recommended', reason: 'カスタムパターン・顧客名辞書で検出精度向上' },
    { type: 'binary', target: 'python', args: ['-m', 'markitdown', '--help'], kind: 'optional', reason: 'xlsx/docx/pdf 等バイナリファイルのマスク対応' },
    { type: 'env', target: 'NEKO_NOT_YOSHI_DIR', kind: 'optional', reason: 'neko-not-yoshi 配置先の明示指定' },
  ],
  secret: [
    { type: 'tool', target: 'pii', kind: 'related', reason: 'pii-mask-yoshi が safe_read 時にパターン辞書を参照' },
  ],
  health: [
    { type: 'env', target: 'TELEGRAM_BOT_TOKEN', kind: 'optional', reason: 'Telegram 通知に必要' },
    { type: 'env', target: 'TELEGRAM_CHAT_ID', kind: 'optional', reason: 'Telegram 通知の送信先' },
  ],
  release: [
    { type: 'binary', target: 'gh', kind: 'required', reason: 'GitHub Release 作成に必要' },
  ],
  license: [
    { type: 'tool', target: 'release', kind: 'related', reason: 'リリース前にライセンス検査を推奨' },
  ],
  kensa: [],
  doctor: [],
  rescue: [],
};

function checkBinary(name, args) {
  try {
    execFileSync(name, args || ['--version'], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function isToolInstalled(cmd) {
  const tool = TOOLS[cmd];
  if (!tool) return false;
  return existsSync(resolve(getWorkDir(), tool.pkg, tool.bin));
}

function getToolVersion(cmd) {
  const tool = TOOLS[cmd];
  if (!tool) return null;
  try {
    const pkg = JSON.parse(readFileSync(join(getWorkDir(), tool.pkg, 'package.json'), 'utf8'));
    return pkg.version || null;
  } catch {
    return null;
  }
}

export function runCheckup() {
  const workDir = getWorkDir();
  const installed = Object.keys(TOOLS).filter(isToolInstalled);
  const issues = [];
  let okCount = 0;
  let warnCount = 0;
  let errCount = 0;

  console.log('neko-HQ checkup');
  console.log('=' .repeat(70));
  console.log('');

  if (installed.length === 0) {
    console.log('  ツールが1つもインストールされていません。');
    console.log('  neko-hq install <tool> でインストールしてください。');
    return 1;
  }

  console.log(`  検出済みツール: ${installed.length}/${Object.keys(TOOLS).length}`);
  console.log('');

  for (const cmd of installed) {
    const relations = RELATIONS[cmd] || [];
    if (relations.length === 0) continue;

    const version = getToolVersion(cmd) || '?';
    console.log(`  [${cmd}] ${TOOLS[cmd].pkg} v${version}`);

    for (const rel of relations) {
      let status;
      let detail;

      if (rel.type === 'tool') {
        const targetInstalled = isToolInstalled(rel.target);
        const targetVersion = targetInstalled ? (getToolVersion(rel.target) || '?') : null;
        if (targetInstalled) {
          status = 'OK';
          detail = `${rel.target} v${targetVersion}`;
          okCount++;
        } else if (rel.kind === 'required') {
          status = 'ERROR';
          detail = `${rel.target} 未検出（必須）`;
          errCount++;
          issues.push({ cmd, rel, status });
        } else {
          status = 'WARN';
          detail = `${rel.target} 未検出`;
          warnCount++;
          issues.push({ cmd, rel, status });
        }
      } else if (rel.type === 'binary') {
        const found = checkBinary(rel.target, rel.args);
        if (found) {
          status = 'OK';
          detail = `${rel.target} 検出`;
          okCount++;
        } else if (rel.kind === 'required') {
          status = 'ERROR';
          detail = `${rel.target} 未検出（必須）`;
          errCount++;
          issues.push({ cmd, rel, status });
        } else {
          status = 'WARN';
          detail = `${rel.target} 未検出`;
          warnCount++;
          issues.push({ cmd, rel, status });
        }
      } else if (rel.type === 'env') {
        const val = process.env[rel.target];
        if (val) {
          status = 'OK';
          detail = `${rel.target} 設定済み`;
          okCount++;
        } else if (rel.kind === 'required') {
          status = 'ERROR';
          detail = `${rel.target} 未設定（必須）`;
          errCount++;
          issues.push({ cmd, rel, status });
        } else {
          status = 'WARN';
          detail = `${rel.target} 未設定`;
          warnCount++;
          issues.push({ cmd, rel, status });
        }
      }

      const icon = status === 'OK' ? 'OK' : status === 'WARN' ? 'WARN' : 'NG';
      const kindLabel = rel.kind === 'required' ? '必須' : rel.kind === 'recommended' ? '推奨' : '任意';
      console.log(`    [${icon}] ${detail} (${kindLabel}: ${rel.reason})`);
    }
    console.log('');
  }

  // Policy validation
  const policyDir = getPolicyDir();
  if (existsSync(policyDir)) {
    console.log('  [Policy]');
    const policyIssues = validatePolicy();
    if (policyIssues.length === 0) {
      console.log('    [OK] .neko-policy/ 整合性チェック PASS');
      okCount++;
    } else {
      for (const pi of policyIssues) {
        console.log(`    [WARN] ${pi}`);
        warnCount++;
      }
    }
    console.log('');
  }

  console.log('=' .repeat(70));
  console.log(`  結果: OK=${okCount}  WARN=${warnCount}  ERROR=${errCount}`);

  if (issues.length > 0) {
    console.log('');
    console.log('  対処:');
    for (const issue of issues) {
      const r = issue.rel;
      if (r.type === 'tool') {
        console.log(`    neko-hq install ${r.target}`);
      } else if (r.type === 'binary') {
        console.log(`    ${r.target} をPATHに追加`);
      } else if (r.type === 'env') {
        console.log(`    環境変数 ${r.target} を設定`);
      }
    }
  }

  console.log('');
  return errCount > 0 ? 1 : 0;
}
