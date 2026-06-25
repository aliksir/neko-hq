---
title: "AIコーディングアシスタントがファイルを編集するとき、個人情報をどう守るか ― MCP層での透過的PIIマスキングの設計と実装"
emoji: "🔒"
type: "tech"
topics: ["mcp", "claude", "security", "pii", "privacy", "codex", "gemini"]
published: true
---

## 概要

AIコーディングアシスタント（AI CLI全般: Claude Code / Codex / Gemini CLI）がファイルを読み書きするとき、**個人情報（PII）がLLMのサーバーに送信される問題**がある。本稿では、ツール呼び出しプロトコル（MCP）の層で**読取時に自動マスク・書戻し時に自動復元**する透過的PIIマスキングの仕組みを解説する。OSSとして公開済み（Apache-2.0）。

## 背景：AIがファイルを読むとき、何が起きているか

Claude CodeやCursorのようなAIコーディングアシスタントは、ファイルの読み書きを**ツール呼び出し**（Tool Use）で行う。Anthropicが策定したMCP（Model Context Protocol）では、AIが`Read`ツールを呼ぶとファイル内容がそのままLLMに送信される。

```
[AIアシスタント] → Read("顧客リスト.csv") → [MCPサーバー] → ファイル内容 → [LLMサーバーへ送信]
```

ここで問題になるのが**PII（Personally Identifiable Information）の流出**だ。顧客名、メールアドレス、電話番号、住所、クレジットカード番号、マイナンバー等がファイルに含まれていた場合、それがそのままLLMプロバイダのサーバーに送られる。

既存のDLP（Data Loss Prevention）ツールはネットワーク境界やクラウドストレージを監視するが、**AIエージェントのツール呼び出し経路**は監視対象外である。

## 提案手法：MCP層での双方向マスキング

### 設計原則

1. **透過性**: AIは通常通りファイルを読み書きできるが、生のPIIには一切アクセスできない
2. **可逆性**: マスクは確定的トークンに置換され、セッション内で一意に復元可能
3. **セッション一貫性**: 同一のPII値は常に同一のトークンに変換される（`田中太郎` → `[CUSTOMER-001]` は固定）
4. **ローカル完結**: トークンマッピングテーブルはローカルにのみ保持。LLMサーバーには送信しない

### アーキテクチャ

```
                          ┌──────────────────────────────────┐
                          │   MCP Server (pii-mask-yoshi)    │
                          │                                  │
[AI] ─ safe_read(path) ──│→ ファイル読取                     │
                          │→ PII検出（regex + 暗号化辞書）   │
                          │→ トークン置換 (田中太郎→[CUSTOMER-001]) │
                          │→ マッピング保存 (ローカル)        │
                          │← マスク済みテキストをAIに返却    │──→ [LLMサーバー]
                          │                                  │    (PIIなし)
[AI] ─ unmask_file ──────│→ マスク済みテキスト読取           │
  (input, output)         │→ トークン→元値復元               │
                          │→ 復元済みファイルをローカル保存   │
                          │← "復元完了" のみAIに返却         │──→ [LLMサーバー]
                          │                                  │    (PIIなし)
                          └──────────────────────────────────┘
```

**重要**: `unmask_file`は復元結果をローカルファイルに書き出すだけで、**復元されたPIIテキストをAPI応答としてAIに返さない**。これにより、復元フェーズでもPIIがLLMサーバーに送信されることを防ぐ。

### MCPネイティブツール定義

本手法の特徴は、プロキシ型（AI↔LLM間のMITM）ではなく、**MCPサーバー内のネイティブツール**として実装する点にある。

```json
{
  "name": "safe_read",
  "description": "ファイルを読み取り、PIIを自動マスクして返す",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  }
}
```

AIは通常の`Read`ツールの代わりに`safe_read`を使う。ツール名がセマンティクスを持つため、AIが「このファイルはマスクして読む必要がある」と判断して適切なツールを選択できる。

## PII検出: 3層ハイブリッドアプローチ

### 第1層: ビルトインパターン（正規表現）

メールアドレス、電話番号、IPアドレス、ローカルパス等の構造的PIIを正規表現で検出する。

```javascript
const BUILTIN_PATTERNS = [
  { id: 'email',  regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, maskPrefix: 'EMAIL' },
  { id: 'phone-jp', regex: /0\d{1,4}-\d{1,4}-\d{4}/g, maskPrefix: 'TEL' },
  { id: 'ipv4', regex: /(?:\d{1,3}\.){3}\d{1,3}/g, maskPrefix: 'IPv4' },
  // ...
];
```

IPv4はバリデータ付きで、プライベートIPとグローバルIPを区別する（`192.168.1.1`は`[PRIV-IPv4-001]`、グローバルIPは`[IPv4-001]`）。

### 第2層: 拡張パターン（クレデンシャル・金融・日本固有PII）

JWTトークン、APIキー（OpenAI/GitHub/AWS/Anthropic）、クレジットカード番号（Luhnチェック付き）、マイナンバー、銀行口座番号、パスポート番号、法人番号、日本語住所、日本語人名等を検出する。

クレジットカード番号はLuhnアルゴリズムで検証し、false positiveを抑制する:

```javascript
function luhnCheck(num) {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
```

### 第3層: 暗号化プライベート辞書（顧客固有エンティティ）

**これが本手法の最大の差別化ポイント**である。

正規表現では検出できない**顧客名・取引先名**等の固有名詞を、暗号化されたプライベート辞書から読み込んで検出する。

```
ngwords.private.json (平文、.gitignore対象)
  → { "words": [{ "value": "田中太郎", "category": "customer" }, ...] }

ngwords.private.enc.json (AES-256-GCM暗号化、git管理可)
  → 暗号化バイナリ（鍵は ~/.pii-mask-yoshi/.key）
```

**動作フロー**:
1. 起動時に平文辞書 or 暗号化辞書を読み込む
2. 暗号化辞書の場合、ローカルの鍵ファイル or 環境変数で復号
3. 各顧客名を正規表現に変換（`田中太郎` → `/田中太郎/g`）
4. ファイル走査時にビルトインパターン + プライベート辞書のハイブリッドで検出

**利点**:
- 辞書ファイルを暗号化してgit管理できる（CI/CDパイプラインで安全に配布可能）
- 正規表現では捕捉できない固有名詞（企業名・人名）を網羅
- 公開版パターン（汎用regex）と非公開版辞書（顧客実名）を分離

### 鍵管理の3パターン

| パターン | 鍵の保管場所 | 想定ユースケース |
|---------|------------|----------------|
| **ローカルファイル** | `~/.pii-mask-yoshi/.key` | 個人開発マシン |
| **環境変数** | `PII_MASK_ENCRYPT_KEY` | CI/CD、Docker |
| **鍵なし（平文運用）** | なし | 開発初期、検証環境 |

**ローカルファイル方式**（推奨）:
```bash
# 初回セットアップ時に自動生成（パーミッション 0600）
# ~/.pii-mask-yoshi/.key に base64エンコードされた32バイト鍵が保存される
# .gitignoreに追加済み — gitリポジトリには含まれない
```

**環境変数方式**（CI/CD向け）:
```bash
# GitHub Actions / GitLab CI のシークレットに登録
export PII_MASK_ENCRYPT_KEY="base64エンコードされた32バイト鍵"
# 環境変数が存在する場合、ローカルファイルより優先される
```

**鍵の解決順序**: 環境変数 → ローカルファイル → null（暗号化なし）

鍵が存在しない場合、辞書・マッピングテーブルは平文で保存される。暗号化は後からでも有効化でき、既存の平文ファイルは次回書き込み時に自動的に暗号化される。

## トークンマッピングとセッション管理

### 確定的トークン生成

同一セッション内で同一の値には同一のトークンを割り当てる:

```javascript
getOrCreate(original, prefix) {
  const key = `${prefix}::${original}`;
  if (this.originalToToken.has(key)) {
    return this.originalToToken.get(key);
  }
  this.counters[prefix]++;
  const token = `[${prefix}-${String(this.counters[prefix]).padStart(3, '0')}]`;
  this.tokenToOriginal.set(token, original);
  this.originalToToken.set(key, token);
  return token;
}
```

`田中太郎`は常に`[CUSTOMER-001]`に変換される。AIはマスクトークンを含むテキストを見て編集するが、トークンが一貫しているため文脈を正しく理解できる。

### マッピングテーブルの暗号化保存

マッピングテーブル（トークン↔元値の対応表）は`~/.pii-mask-yoshi/maps/`にJSONとして保存する。暗号化鍵が存在する場合はAES-256-GCMで暗号化してから保存する。

```javascript
save() {
  const json = JSON.stringify(data, null, 2);
  const key = resolveKey();
  writeFileSync(path, key ? encrypt(json, key) : json, 'utf8');
}
```

### セッションライフサイクル

マッピングテーブルはセッション単位で生成され、設定可能な保持期間（デフォルト30日）を超えたものは`cleanup`ツールで一括削除される。SIEM連携用のブロックレポートやログファイルもセッション単位で同時削除する。

## SIEM連携

検出されたPIIのメタデータ（カテゴリ・ファイル名・行番号）を、以下の形式でセキュリティ監視基盤に出力できる:

- **JSONL**: Splunk/Datadog汎用（1検出1行）
- **CEF**: Common Event Format（ArcSight/QRadar向け）
- **ECS**: Elastic Common Schema

これにより、AIコーディングアシスタントが処理したPIIの監査証跡を組織のセキュリティ運用に統合できる。

### JSONL出力例（Splunk/Datadog汎用）

```json
{"timestamp":"2026-06-09T15:30:00.000Z","event_type":"pii_detection","session_id":"session-abc123","host":"dev-workstation","file":"data.csv","line":2,"category":"PERSON","token":"[PERSON-001]","severity":"high"}
{"timestamp":"2026-06-09T15:30:00.000Z","event_type":"pii_detection","session_id":"session-abc123","host":"dev-workstation","file":"data.csv","line":2,"category":"EMAIL","token":"[EMAIL-001]","severity":"high"}
```

### CEF出力例（ArcSight/QRadar向け）

```
CEF:0|aliksir|pii-mask-yoshi|0.4.0|pii_detection|PII Detected|7|src=data.csv spt=2 cs1=PERSON cs1Label=Category cs2=[PERSON-001] cs2Label=Token dvchost=dev-workstation externalId=session-abc123
```

### ECS出力例（Elastic Common Schema）

```json
{
  "@timestamp": "2026-06-09T15:30:00.000Z",
  "event": {
    "kind": "alert",
    "category": ["intrusion_detection"],
    "module": "pii-mask-yoshi",
    "severity": 7
  },
  "file": { "path": "data.csv" },
  "source": { "line": 2 },
  "rule": { "category": "PERSON" },
  "message": "[PERSON-001]",
  "agent": { "name": "pii-mask-yoshi", "version": "0.4.0" }
}
```

`block_report` ツールを `--format jsonl|cef|ecs` オプション付きで呼び出すことで、組織のSIEM基盤に直接投入可能な形式で出力される。

## 実装: pii-mask-yoshi

本手法はOSSとして公開している。

- **リポジトリ**: https://github.com/aliksir/pii-mask-yoshi
- **ライセンス**: Apache-2.0
- **技術スタック**: Node.js v22+、外部依存ゼロ
- **MCPプロトコル**: stdio transport

### ツール一覧

| ツール | 機能 |
|--------|------|
| `safe_read` | ファイル読取+PIIマスク |
| `unmask_file` | マスクトークン→元値復元（ファイル出力のみ） |
| `mask_stats` | セッション統計表示 |
| `block_report` | 検出PII一覧（SIEM連携対応） |
| `cleanup` | 期限超過データ削除 |

### 使い方

```jsonc
// .mcp.json に追加
{
  "mcpServers": {
    "pii-mask-yoshi": {
      "command": "node",
      "args": ["path/to/pii-mask-yoshi/index.mjs"]
    }
  }
}
```

AIアシスタントは機密ファイルを扱うとき`safe_read`を使い、編集後に`unmask_file`で復元する。

## 他のAI CLIとの互換性

pii-mask-yoshiはMCPプロトコル（stdio transport）に準拠しているため、MCPをサポートする任意のAI CLIで動作する。

| AI CLI | MCP対応状況 | pii-mask-yoshi動作 |
|--------|-----------|------------------|
| Claude Code | ネイティブ対応 | `.mcp.json` で設定 |
| OpenAI Codex CLI | MCP対応（2025〜） | 同一設定で動作 |
| Google Gemini CLI | MCP対応（2025〜） | 同一設定で動作 |
| Cursor | MCP対応 | 設定画面から追加 |
| Windsurf | MCP対応 | 設定画面から追加 |

MCPサーバーはプロトコル層で標準化されているため、**AI CLI側の設定変更のみ**で利用可能。ツール実装の変更は不要。

```jsonc
// Codex CLI / Gemini CLI でも同じ設定
{
  "mcpServers": {
    "pii-mask-yoshi": {
      "command": "npx",
      "args": ["-y", "pii-mask-yoshi"]
    }
  }
}
```

## 実践: safe_read → 編集 → unmask_file のワークフロー

### Step 1: safe_read でマスクされた内容を取得

```
AI> このファイルの顧客情報を更新して
   → safe_read("顧客マスタ.csv") を呼び出し

# AIが受け取るテキスト（マスク済み）:
id,name,email,phone
1,[PERSON-001],[EMAIL-001],[TEL-001]
2,[PERSON-002],[EMAIL-002],[TEL-002]
3,[PERSON-003],[EMAIL-003],[TEL-003]
```

### Step 2: AIがマスクトークンのまま編集

```
# AIはマスクトークンを維持したまま処理:
AI> [PERSON-002]のメールアドレスを更新しますね

id,name,email,phone
1,[PERSON-001],[EMAIL-001],[TEL-001]
2,[PERSON-002],[EMAIL-004],[TEL-002]    ← メールのみ変更
3,[PERSON-003],[EMAIL-003],[TEL-003]
```

### Step 3: unmask_file でローカルに復元

```
AI> unmask_file("edited.csv", "顧客マスタ.csv") を呼び出し

# ローカルファイルに復元される（AIには"復元完了"のみ返却）:
id,name,email,phone
1,山田太郎,****@****.com,03-****-****
2,鈴木花子,****@****.com,06-****-****   ← 復元+更新
3,田中一郎,****@****.com,052-***-****
```

※ 復元後のファイルには実際のPII（氏名・メールアドレス・電話番号）が復元される。上記は記事掲載のため伏字表示。

**ポイント**: Step 2でAIが扱うのはマスクトークンのみ。生のPIIはStep 1のローカルマスク処理とStep 3のローカル復元でしか存在せず、LLMサーバーには一切送信されない。

## 既存手法との比較

| 観点 | 従来DLP | プロキシ型（Rehydra等） | 本手法（MCPネイティブ） |
|------|--------|---------------------|---------------------|
| 保護対象 | ネットワーク境界 | AI↔LLM通信全体 | ファイルI/O経路 |
| 実装レイヤー | ネットワーク | MITM proxy | MCPサーバー内ツール |
| 検出方法 | regex/NER | regex/NER | **regex + 暗号化プライベート辞書** |
| 辞書管理 | 平文 | 平文 | **AES-256-GCM暗号化** |
| 復元経路 | N/A | API応答に含む | **ファイル出力のみ（API非送信）** |
| 監査証跡 | SIEM連携あり | なし | **SIEM連携（JSONL/CEF/ECS）** |

## 本手法で防げるもの / 防げないもの

### 防げるもの

| リスク | 防御方法 |
|--------|---------|
| ファイル内のPIIがLLMサーバーに送信される | safe_readでマスクしてから送信 |
| AIが生のPIIを記憶・学習する | トークンのみ送信されるため不可能 |
| マッピングテーブルの平文流出 | AES-256-GCM暗号化保存 |
| 顧客固有の固有名詞が漏洩する | 暗号化プライベート辞書で検出 |
| PII処理の監査証跡が残らない | SIEM連携（JSONL/CEF/ECS） |

### 防げないもの（限界）

| リスク | 理由 | 緩和策 |
|--------|------|--------|
| AIが通常の`Read`ツールを使った場合 | MCPの`safe_read`を経由しなければマスクされない | Claude Codeの`PreToolUse` hookでReadをブロックし`safe_read`に誘導する |
| プロンプトに直接PIIを貼り付けた場合 | ユーザー入力はMCPを経由しない | 運用ルール（PIIは直接貼らない）で対応 |
| 画像・PDF内のPII | 現時点では非構造化データの検出は対象外 | 将来的にOCR連携を検討 |
| LLMがPIIを推測・生成する場合 | マスクトークンから元の値を推測する可能性はゼロではない | トークンは意味のない連番（`[PERSON-001]`）のため推測困難 |
| マッピングテーブル自体への不正アクセス | ローカルファイルのアクセス制御に依存 | 鍵ファイルはパーミッション0600、暗号化保存 |
| 正規表現パターンに一致しないPII | 未知のPIIフォーマットは検出不可 | プライベート辞書で個別追加、ビルトインパターンの継続拡充 |

**設計上の割り切り**: 本手法は「AIが扱うファイルI/O経路」の保護に特化している。ユーザーの入力経路やAIの推論能力自体の制御は対象外であり、組織のセキュリティポリシーとの併用を前提とする。

## まとめ

AIコーディングアシスタントの普及に伴い、開発者のローカルファイルに含まれるPIIがLLMサーバーに送信されるリスクが顕在化している。本稿では、MCPツール層での双方向マスキング（読取時マスク・書戻し時復元）と、暗号化プライベート辞書によるハイブリッドPII検出を組み合わせた透過的保護手法を示した。

本手法により、AIはマスクされたトークンのみを扱い、生のPIIに一切アクセスすることなくファイル編集が可能になる。暗号化辞書の採用により、正規表現では捕捉困難な顧客固有エンティティも安全に検出・保護できる。

---

公開日: 2026-06-09
著者: aliksir
ライセンス: Apache-2.0
