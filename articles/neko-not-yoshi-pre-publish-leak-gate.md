---
title: "AIエージェント時代の公開前漏洩防止 ― NGワード辞書を暗号化してgit push前に止める neko-not-yoshi"
emoji: "🛑"
type: "tech"
topics: ["security", "git", "nodejs", "ai", "oss"]
published: true
published_at: 2026-06-12 08:00
---

## 概要

公開リポジトリへの `git push` 前に、個人情報・顧客名・グローバルIPを機械検出して push を止めるスキャナ **neko-not-yoshi** の設計と運用を解説する。名前の由来は「猫が"ヨシッ"と言えないものを検出する」。

主題は3つ。NGワード辞書の**2層分離**（公開可能な正規表現パターン / 暗号化された顧客名実体）、混同されがちな **blacklist・whitelist・allowlist の3リスト設計**、そしてセキュリティツール特有の難問である **IOC（脅威インテリ指標）の誤検出を、見逃しなしを目指す方針を保ったまま抑制する downgrade ルール**である。

OSSとして公開済み（MIT）。[前回解説した pii-mask-yoshi](https://zenn.dev/aliksir/articles/pii-mask-yoshi-mcp-pii-masking)（AIに読ませる**前**の防御）と対になる、公開する**前**の防御層にあたる。

## 背景：漏洩は「公開する瞬間」に起きる

AIコーディングエージェントの普及で、1セッションに数十のファイルが生成・編集され、その多くが大したレビューもなく public リポジトリへ push される時代になった。問題は生成量に対して人間の目視が追いつかないことだ。漏洩は悪意ではなく事故で起きる。

- 調査ログをそのまま `docs/` に貼る（社内のIPアドレスやメールアドレスが残っている）
- 実環境の設定をREADMEのサンプルに流用する（グローバルIPがそのまま載る）
- 顧客名入りの作業メモがコミットに紛れ込む

gitleaks に代表される既存の secret scanner は、APIキーやトークンといった「形式が決まっている機密」の検出が主戦場である。一方、**「顧客名」「日本語の個人名」「このIPはグローバルか」のような組織固有・文脈依存の機密は守備範囲外**になりやすい。ここを埋めるのが neko-not-yoshi だ。

## 二段防御：「読ませる前」と「公開する前」

| | pii-mask-yoshi | neko-not-yoshi |
|---|---|---|
| 防御タイミング | AIにファイルを**読ませる前** | 公開リポへ**pushする前** |
| 実装レイヤー | MCPツール層（`safe_read` / `unmask_file`） | CLI + push前ゲート（exit code連動） |
| 守るもの | LLMサーバーへのPII送信 | publicリポへの漏洩混入 |
| 方式 | 可逆トークン置換（マスク） | 検出してpushを止める（block） |

入口（AIへの入力経路）と出口（公開への出力経路）で守る場所が違うため、どちらか片方では穴が残る。本稿は出口側の話である。

## pushを止める仕組み：exit code連動の最後の砦

`scan` は block 検出時に exit 1 を返す。シェルの `&&` で繋ぐだけで push ゲートになる。

```bash
node src/cli.mjs scan <repo> && git push
```

仕組みがCLIとexit codeだけなので、AI CLIの種類にも開発言語にも依存しない。pre-pushフックやCIジョブにもそのまま組み込める。

実際の検出例を見る。次の内容のファイルを含むディレクトリをスキャンする。

```markdown
# incident report
contact: taro@example.org
C2: 203.0.113.7
internal: 192.168.1.10
```

```
$ node src/cli.mjs scan ./demo
report.md:2: [warning][pii] taro@example.org (email)
report.md:3: [block][network] 203.0.113.7 (ipv4)
report.md:4: [warning][network] 192.168.1.10 (ipv4)
1 files scanned. block=1 warning=2 -> exit 1
```

重大度は2層に分かれる。

- **block**: push を止める（exit 1）。グローバルIPなど
- **warning**: 報告のみ（exit 0）。メールアドレス、プライベートIPなど

IPv4はバリデータで**グローバルとプライベートを区別**する。`192.168.1.10` は内部情報として報告に残るが push は通り、グローバルIPは block で止まる。`--warnings-as-errors` を付ければ warning も exit 1 にできる。

### 走査範囲の設計

デフォルトの走査対象は「git追跡ファイル + 未追跡（.gitignore対象外）ファイル」、つまり `git ls-files --cached --others --exclude-standard` 相当である。これには理由が2つある。

- `git add` する**前**の新規ファイルこそ漏洩しうるので、未追跡ファイルも検査する
- .gitignore 済みのローカル生成物（実行ログ等）は push されないので除外する

`--all` を付ければ .gitignore 済みも含めて全走査できる。

## NGワード辞書の2層分離

検出パターンは2つのファイルに分離されている。

| ファイル | 内容 | 公開 |
|---|---|---|
| `ngwords.public.json` | 正規表現パターン（email / 電話 / IP / ホームパス / ローカルパス） | リポ同梱可 |
| `ngwords.private.json` | 顧客名・個人名の**実体** | `.gitignore` 対象、手元限定 |

この分離により「**検出器そのものを公開しても、どの顧客名・固有名詞を検出しているかは漏れない**」。public 側は構造的パターンのみで具体名を含まず、顧客名のような固有名詞は private 側に隔離される。

登録は人手とAIセッションからの自動蓄積の2経路がある。

```bash
node src/cli.mjs add --private "顧客名"                 # private（.gitignore）に登録
node src/cli.mjs add --public "<regex>" --category pii  # publicパターン登録
node src/cli.mjs import words.csv                       # CSV/TXT/Markdownの一括投入
node src/cli.mjs export --format md                     # 棚卸し用エクスポート
```

なお `export` はデフォルトで private リストを出力するため、**出力ファイル自体が機密になる**。出力先は .gitignore 済みディレクトリに限定する。

## 3つの「リスト」の使い分け

この種のツールで混乱しやすいのが blacklist / whitelist / allowlist の区別だ。neko-not-yoshi では役割を明確に分けている。

| | NGワード辞書（blacklist） | whitelist | allowlist |
|---|---|---|---|
| 単位 | パターン / 語 | **用語単位**（グローバル） | **検出単位**（パス + カテゴリ） |
| 効果 | 検出する | マッチ対象から除外する | 特定の検出を抑制（allow）または降格（downgrade） |
| 用途 | 検出対象の定義 | そもそも機密でない一般IT用語 | 特定ファイルの既知 false positive |

### whitelist：一般IT用語の除外

NGワードをAIセッションから自動蓄積していると、「AWS」「Kubernetes」「OAuth」のような一般IT用語が辞書に混入して誤検出が増える。whitelist に登録された用語は NGワードマッチから除外される（大文字小文字無視の**完全一致**。「API」を登録しても「API Gateway」はスキップされない）。

公開版 `ngwords-whitelist.json` には**キュレーション済みの一般IT用語319件**（AWS/Azure/GCPのサービス名、OSSプロジェクト名、プロトコル、規格名）を同梱し、環境固有の用語は `.local.json`（.gitignore対象）に分離して足せる。

### allowlist：検出単位のピンポイント抑制

allowlist の各エントリは `action` を持つ。

- `"allow"`: 完全許可。finding 自体を抑制する（`match` 必須）
- `"downgrade"`: block→warning へ降格。**finding は残る**ので報告には出続けるが、exit 0 になり push は通る

downgrade の設計意図は「**見逃さないまま通す**」である。検出を消さずに重大度だけ下げるため、何が許可されているかが報告から消えない。そして `customer`（顧客名）カテゴリは**降格対象外**としてハードコードされている。顧客名だけは何があっても素通しさせない、という不変条件の保護だ。

## IOC問題：セキュリティツールのリポは「攻撃者のIP」を含む

allowlist の downgrade が本領を発揮するのが IOC（Indicator of Compromise）の誤検出だ。

セキュリティ検知ツールのリポジトリは、公開脅威インテリジェンスの C2 サーバーIPを README や検知スクリプト本体に直書きすることがある。これは**ツールの検知対象であって、自リポの漏洩ではない**。だがスキャナにはその区別がつかず、グローバルIPとして block になる。

これを per-IP × ファイル限定の downgrade エントリで抑制する。

```json
{"action":"downgrade","match":"<IOC IP>","category":["network"],"pathGlob":"**/scan.sh"}
```

歯止めは2層ある。

1. `match` は特定のIOC IPの**厳密リテラル**（サブネットやワイルドカードは使わない）
2. `pathGlob` はそのIOCが出現する**実ファイルに限定**

この構成では、未列挙の本物のグローバルIP（将来の漏洩を含む）、同一ファイル内の別の本物IP、pathGlob 外に現れた同じIOC IPは、すべて block のまま維持される。しかも downgrade なので当該IOCも warning として報告に残り続ける。

運用手順も「人間の確認」を挟む形で固定している。

1. 対象リポを `scan` し、block になる IOC IP と出現ファイルを特定する
2. そのIPが**公開された脅威インテリのIOCであり、自リポの漏洩でないこと**を人間が確認する
3. allowlist に IP × 出現ファイルぶんのエントリを追記する
4. 再 `scan` で block=0、かつ当該IPが warning に**残っている**ことを確認する

余談だが、この記事自身も公開前に同じゲートを通している。記事中のデモ用IP（RFC5737の文書用予約レンジ）が実際に block 判定になり、まさに上記の手順で「IP × 本記事ファイル限定」の downgrade エントリを適用した。IOC問題のミニチュア版が、IOC問題を解説する記事の上で再現した格好である。

## private辞書の暗号化（AES-256-GCM）

ここで皮肉な問題が生じる。顧客名を検出するための private 辞書は、**顧客名の一覧という最も濃い機密ファイル**になる。.gitignore による隔離だけでは、ローカルに平文で置かれ続けることに変わりはない。

そこで private 辞書は AES-256-GCM で保存時暗号化できる。

```bash
node src/cli.mjs keygen                    # 鍵生成（.neko-keyfile、.gitignore対象）
node src/cli.mjs encrypt --delete-source   # 暗号化して平文を削除
node src/cli.mjs decrypt                   # 編集時のみ復号
```

鍵は以下の優先順位で解決される。

| 優先度 | ソース | 用途 |
|---|---|---|
| 1 | `NEKO_ENCRYPT_KEY` 環境変数 | Base64エンコードの256ビット生鍵。CI/CD向け |
| 2 | `NEKO_ENCRYPT_PASSPHRASE` 環境変数 | パスフレーズ（scryptで鍵導出） |
| 3 | `.neko-keyfile`（プロジェクトルート） | `keygen` で生成。個人マシン向け |

実用上の要点は**透過的復号**である。`scan` は平文の `ngwords.private.json` がない場合、暗号化済みの `ngwords.private.enc.json` を自動検出してメモリ上で復号する。スキャンのたびに手動復号して平文を作る必要がない（平文がディスクに現れるのは辞書を編集するときだけ）。また GCM は認証付き暗号なので、暗号化ファイルの改ざんも検出できる。

## v0.1.4：false positive との戦い

導入直後にぶつかる最大の敵は誤検出だった。NGワードをAIセッションから自動蓄積する設計は網羅性を上げる一方、一般用語の混入で誤検出が増え、ゲートが「狼少年」化する。v0.1.4 はこの対策が中心である。

- **whitelist 319語の同梱**: 前述のキュレーション済み一般IT用語
- **マルチモデルLLMクロスチェック**: NGワード候補リストをローカルOllamaの複数モデル（デフォルト2モデル）に「機密か一般用語か」を判定させる補助ツール。判定の統合は**1モデルでも機密と判定すれば残す**安全側マージで、判定が取れなかった候補も残す側に倒す。誤検出の削減を、検出漏れを増やす方向に作用させないための設計だ。ローカルLLMのみで完結し、外部APIには送信しない
- **serve（Web UI）**: `node src/cli.mjs serve` で localhost:7307 に管理画面が立ち、NGワード・whitelist をブラウザで確認・編集できる

ここで重要な区別がある。**LLMを使うのは辞書のメンテナンスだけで、スキャン自体は決定的なパターンマッチ**である。スキャンにLLMを混ぜると結果の再現性が失われ、push ゲートとしての信頼性が崩れる。決定的なスキャンと、確率的なメンテ補助。この線引きは意図的なものだ。

## 実践：blockを踏んでからpushが通るまで

実際の運用は「block を踏む → 分類して対処 → 再スキャン」のループになる。

```bash
# 1. スキャンで block 検出、push が止まる
$ node src/cli.mjs scan . && git push
report.md:2: [warning][pii] taro@example.org (email)
report.md:3: [block][network] 203.0.113.7 (ipv4)
report.md:4: [warning][network] 192.168.1.10 (ipv4)
1 files scanned. block=1 warning=2 -> exit 1

# 2. 検出を3分類して対処
#    a) 本物の漏洩       → 該当箇所を除去、または mask で伏字化
#    b) 一般用語の誤検出  → whitelist に登録
#    c) ファイル固有のFP・IOC → allowlist（allow / downgrade）

$ node src/cli.mjs mask . --write    # デフォルトは dry-run。--write で実書換
report.md:3: 203.0.113.7 -> xxx.xxx.xxx.xxx
マスク適用完了: 1件 (--write)

# 3. 再スキャンで block=0 を確認して push
$ node src/cli.mjs scan . && git push
report.md:2: [warning][pii] taro@example.org (email)
report.md:4: [warning][network] 192.168.1.10 (ipv4)
1 files scanned. block=0 warning=2 -> exit 0
```

`mask` がデフォルト dry-run なのは、ゲートツールが勝手にファイルを書き換えるべきではないからだ。書換は `--write` を明示したときだけ行われる。また mask が伏字化するのは block 検出のみで、warning は対象外である（`--include-warnings` で含められる）。先の出力で email が warning のまま残っているのはそのためだ。

## 防げるもの / 防げないもの

### 防げるもの

| リスク | 防御方法 |
|---|---|
| グローバルIPの混入したまま push | block + exit 1 で push 中断 |
| 登録済み顧客名・個人名の混入 | private 辞書マッチで検出（customer は降格不可） |
| `git add` 前の新規ファイルからの漏洩 | 未追跡ファイルも走査対象 |
| private 辞書そのものの漏洩 | .gitignore + AES-256-GCM 保存時暗号化 |
| 誤検出による運用崩壊（狼少年化） | whitelist / allowlist / LLMクロスチェック |

### 防げないもの（限界）

| リスク | 理由 |
|---|---|
| 辞書に未登録の固有名詞 | パターンにも語リストにも合致しない |
| 文脈依存の機密（事業計画の内容など） | パターンマッチの守備範囲外 |
| 難読化・エンコードされた機密 | 平文マッチのみ |
| 画像・PDF内の機密 | テキスト走査のみ |
| 表記ゆれ | private 語のASCIIマッチは case-sensitive（`Acme` 登録で `acme` は別扱い） |

明確にしておきたいのは、**本ツールは漏洩ゼロを保証しない**ということだ。scan の PASS が意味するのは「既知のパターンと辞書に対する検出がゼロ」であり、それ以上ではない。最終的な公開可否の判断は人間のレビューが前提である（READMEの免責事項にも明記している）。push 前ゲートの役割は、人間が事故で見落とすものを機械で減らし、機械が原理的に見逃すものを人間が拾う——その補完関係の片側を受け持つことだ。

## まとめ

- `git push` 前の exit code 連動ゲートで、「公開する瞬間」に最後の機械検査を入れる
- 辞書の2層分離（public=パターン / private=実体）と AES-256-GCM 暗号化で、「検出器の公開」と「検出対象の秘匿」を両立する
- blacklist / whitelist / allowlist の3リストと IOC downgrade により、見逃しなしを目指す方針を保ったまま誤検出を運用で抑え込む
- LLMはスキャンではなく辞書メンテに使う（決定的スキャン + 確率的メンテ補助の分離）

前回の pii-mask-yoshi（読ませる前）と本稿の neko-not-yoshi（公開する前）で、AIエージェント運用の入口と出口に防御層が揃った。次回はこの2本を含むエコシステム全体の構成を紹介する予定だ。

- **リポジトリ**: https://github.com/aliksir/neko-not-yoshi
- **ライセンス**: MIT
- **技術スタック**: Node.js v22+、外部依存ゼロ

---

公開日: 2026-06-12
著者: aliksir
ライセンス: MIT
