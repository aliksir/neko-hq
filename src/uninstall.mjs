// 導入済みツールを _deleted/ に退避してアンインストールする（rm 禁止・退避方式）
import { existsSync, renameSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS } from './dispatcher.mjs';
import { appendLog } from './log.mjs';
import { getWorkDir } from './constants.mjs';

// 退避先ディレクトリ（_deleted/）: 即削除せず退避することで誤操作からの回復を可能にする
const getDeletedDir = () => resolve(getWorkDir(), '_deleted');

export function uninstall(command) {
  const tool = TOOLS[command];
  if (!tool) {
    console.error('[neko-hq] 不明なコマンド: ' + command);
    return 1;
  }

  const pkgDir = resolve(getWorkDir(), tool.pkg);
  if (!existsSync(pkgDir)) {
    console.log('[neko-hq] ' + tool.pkg + ' は未導入です');
    return 0;
  }

  // 退避先パス: {_deleted}/{パッケージ名}_{YYYYMMDD} 形式で日付を付与
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const destName = tool.pkg + '_' + dateStr;
  const deletedDir = getDeletedDir();
  const destDir = resolve(deletedDir, destName);

  if (!existsSync(deletedDir)) {
    mkdirSync(deletedDir, { recursive: true });
  }

  if (existsSync(destDir)) {
    console.error('[neko-hq] 移動先が既に存在: ' + destDir);
    return 1;
  }

  const start = Date.now();
  let exitCode = 0;

  try {
    renameSync(pkgDir, destDir);
    console.log('[neko-hq] ' + tool.pkg + ' を退避しました: ' + destDir);
  } catch (err) {
    console.error('[neko-hq] 退避失敗: ' + (err.message || ''));
    exitCode = 1;
  }

  appendLog({
    tool: tool.pkg,
    command: 'uninstall',
    ts: now.toISOString(),
    duration_ms: Date.now() - start,
    exit_code: exitCode,
    meta: { dest: destDir },
  });

  return exitCode;
}
