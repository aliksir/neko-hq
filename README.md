# neko-HQ

Unified CLI headquarters for the neko-gundan (cat army) ecosystem. Manages quality tools (neko-*) and logistics tools (yoshi family) from a single entry point.

## Installation

```bash
git clone https://github.com/aliksir/neko-hq.git
cd neko-hq
```

No dependencies required (zero-dependency design).

## Usage

```bash
node bin/neko-hq.mjs <command> [args...]
```

### Commands

| Command | Description |
|---------|-------------|
| `status` | Show detection status of all tools |
| `stats` | Execution statistics dashboard |
| `install <tool>` | Install a tool (git clone + npm install) |
| `config [tool]` | Show tool configurations |
| `uninstall <tool>` | Archive a tool (move to `_deleted/`) |

### Tools

**Quality & Defense (neko core)**

| Command | Tool | Description |
|---------|------|-------------|
| `doctor` | neko-harness-doctor | Harness diagnostics |
| `secret` | neko-not-yoshi | Secret detection |
| `kensa` | neko-kensa | Inspection |

**Logistics (yoshi family)**

| Command | Tool | Description |
|---------|------|-------------|
| `health` | health-yoshi | Service health check |
| `release` | release-yoshi | Auto release (git tag + gh release) |
| `license` | license-yoshi | License checker |
| `pii` | pii-mask-yoshi | PII masking |
| `rescue` | yoshi | Rescue operations |

### Examples

```bash
# Check all tool availability
node bin/neko-hq.mjs status

# Run health check on local services
node bin/neko-hq.mjs health

# View execution statistics
node bin/neko-hq.mjs stats

# Show health-yoshi configuration
node bin/neko-hq.mjs config health

# Install a missing tool
node bin/neko-hq.mjs install license
```

## Unified Logging

All tool executions are recorded in `~/.neko-hq/stats.jsonl` with a common schema:

```json
{
  "tool": "health-yoshi",
  "command": "health",
  "ts": "2026-06-07T09:45:00.000Z",
  "duration_ms": 1234,
  "exit_code": 0,
  "meta": {}
}
```

## Requirements

- Node.js 18+
- Git (for `install` command)
- Individual tools installed in `C:\work\` (configurable via `NEKO_HQ_WORK_DIR` env var)

## License

MIT

---

# neko-HQ

猫軍団エコシステムの統合CLI司令部。品質ツール（neko系）と兵站ツール（yoshi系）を一元管理する。

## インストール

```bash
git clone https://github.com/aliksir/neko-hq.git
cd neko-hq
```

依存パッケージなし（ゼロ依存設計）。

## 使い方

```bash
node bin/neko-hq.mjs <コマンド> [引数...]
```

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `status` | 全ツールの検出・稼働状況一覧 |
| `stats` | 実行統計ダッシュボード |
| `install <tool>` | ツール導入（git clone + npm install） |
| `config [tool]` | ツール設定確認・一覧 |
| `uninstall <tool>` | ツール退避（`_deleted/` に移動） |

### ツール一覧

**品質・防衛（neko系中核）**

| コマンド | ツール | 説明 |
|---------|--------|------|
| `doctor` | neko-harness-doctor | ハーネス診断 |
| `secret` | neko-not-yoshi | 秘密検出 |
| `kensa` | neko-kensa | 検査 |

**兵站（yoshi道具群）**

| コマンド | ツール | 説明 |
|---------|--------|------|
| `health` | health-yoshi | サービスヘルスチェック |
| `release` | release-yoshi | 自動リリース（git tag + gh release） |
| `license` | license-yoshi | ライセンスチェック |
| `pii` | pii-mask-yoshi | PII マスキング |
| `rescue` | yoshi | レスキュー |

### 使用例

```bash
# 全ツールの稼働状況を確認
node bin/neko-hq.mjs status

# ローカルサービスのヘルスチェック実行
node bin/neko-hq.mjs health

# 実行統計を表示
node bin/neko-hq.mjs stats

# health-yoshi の設定を確認
node bin/neko-hq.mjs config health

# 未導入ツールをインストール
node bin/neko-hq.mjs install license
```

## 共通ログ

全ツールの実行記録が `~/.neko-hq/stats.jsonl` に統合される:

```json
{
  "tool": "health-yoshi",
  "command": "health",
  "ts": "2026-06-07T09:45:00.000Z",
  "duration_ms": 1234,
  "exit_code": 0,
  "meta": {}
}
```

## 動作要件

- Node.js 18+
- Git（`install` コマンド用）
- 各ツールが `C:\work\` に配置されていること（`NEKO_HQ_WORK_DIR` 環境変数で変更可能）

## ライセンス

MIT
