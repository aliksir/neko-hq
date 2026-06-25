// プリセット定義 — neko-hq install --preset <name> で一括導入
export const PRESETS = {
  minimal: {
    desc: '最小構成 — ハーネス診断 + PII検出のみ',
    tools: ['doctor', 'secret'],
  },
  secure: {
    desc: 'セキュリティ重視 — PII保護 + ライセンス検査 + 診断',
    tools: ['doctor', 'secret', 'pii', 'license'],
  },
  full: {
    desc: '全ツール導入',
    tools: ['gundan', 'doctor', 'secret', 'kensa', 'mcp', 'health', 'release', 'license', 'pii', 'rescue'],
  },
};

export function listPresets() {
  console.log('利用可能なプリセット:');
  console.log('');
  for (const [name, preset] of Object.entries(PRESETS)) {
    console.log('  ' + name.padEnd(12) + preset.desc);
    console.log('  ' + ' '.repeat(12) + 'ツール: ' + preset.tools.join(', '));
    console.log('');
  }
}

export function getPresetTools(name) {
  const preset = PRESETS[name];
  if (!preset) return null;
  return preset.tools;
}
