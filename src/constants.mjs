// 作業ディレクトリ: 環境変数 NEKO_HQ_WORK_DIR が設定されている場合はそちらを優先
export const getWorkDir = () => process.env.NEKO_HQ_WORK_DIR || process.cwd();
