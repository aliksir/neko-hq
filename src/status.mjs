import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { TOOLS } from './dispatcher.mjs';
import { getWorkDir } from './constants.mjs';

/**
 * 全ツールの検出・稼働状況を表示する
 */
export function showStatus() {
  console.log('neko-HQ status');
  console.log('─'.repeat(70));
  console.log(
    '  ' + 'Command'.padEnd(12) +
    'Version'.padEnd(10) +
    'Description'.padEnd(25) +
    'Status'
  );
  console.log('─'.repeat(70));

  for (const [cmd, tool] of Object.entries(TOOLS)) {
    const binPath = resolve(getWorkDir(), tool.pkg, tool.bin);
    const pkgDir = resolve(getWorkDir(), tool.pkg);
    const found = existsSync(binPath);
    let version = '-';
    if (existsSync(pkgDir)) {
      try {
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
        version = pkg.version || '-';
      } catch {
        // package.json なし or パースエラー
      }
    }
    const status = found ? 'OK' : 'NOT FOUND';
    console.log(
      '  ' + cmd.padEnd(12) +
      version.padEnd(10) +
      tool.desc.padEnd(25) +
      status
    );
  }
  console.log('─'.repeat(70));
}
