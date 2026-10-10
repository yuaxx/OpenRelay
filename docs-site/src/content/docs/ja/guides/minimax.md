---
title: MiniMax クライアント
description: MiniMax の認証情報を公開せずに、MiniMax Code と MiniMax CLI のテキストコマンドを OpenRelay 経由でルーティングします。
---

MiniMax は異なる 2 つのコマンドライン製品を提供しています。OpenRelay は、それぞれが実際に公開するプロトコル境界で統合します。

- **MiniMax Code**（`mcode`）は、カスタム Anthropic Messages プロバイダーに対応したコーディングエージェントです。
- **MiniMax CLI**（`mmx`）はマルチモーダルなプラットフォーム CLI です。OpenRelay がルーティングできる Anthropic 互換 API を使うのは、その `text` リソースだけです。

## MiniMax Code

まず MiniMax の案内に従って MiniMax Code をインストールし、サインインしてください。次に OpenRelay を起動し、元に戻せるファイル統合を接続します。

```bash
orl start
orl integration client enable --client mcode
orl mcode
```

![独立したサンプルデータを使った MiniMax Code 統合](/screenshots/minimax-code-integration.png)

この統合は `~/.minimax/config.yaml` に 1 つのブロックをマージします。

```yaml
custom_provider:
  opencodex:
    name: OpenCodex
    kind: custom
    enabled: true
    api: anthropic-messages
    options:
      apiKey: opencodex-loopback
      baseURL: http://127.0.0.1:10100
      authMode: api-key
    models:
      anthropic/claude-opus-5:
        limit:
          context: 1000000
```

実際に生成されるモデル一覧、判明しているコンテキストウィンドウ、推論負荷の段階は、稼働中の OpenRelay カタログから取得します。信頼できるコンテキストウィンドウや推論負荷の段階がないモデルには、推測値を設定せず、その項目を省略します。MCode は現在選択中の負荷をセッション内に保持するため、OpenRelay はその選択を上書きせずに `effortOptions` を出力します。このブロックは実際のキーを書き込まず、`defaultModel` を置き換えず、MiniMax のログインも変更しません。MCode では `custom_provider:opencodex/...` の下からモデルを選びます。

`orl mcode` はクライアント起動前に、このプロバイダーが現在稼働中のプロキシを指していることを確認します。一度有効にした後は、ポートやカタログの機能が変わると `orl sync` が所有ブロックを更新します。自動同期は所有していないブロックを新規作成せず、削除したブロックを再作成せず、OpenRelay の書き込み後に変更されたファイルも上書きしません。意図して再接続する場合は enable コマンドを使ってください。同じ監査可能な統合システムで無効化または復元できます。

```bash
orl integration client disable --client mcode
orl integration client history --client mcode
orl integration client restore --op <opId> [--confirm-drift]
```

`MINIMAX_DATA_DIR` と旧式の `MAVIS_DATA_DIR` はどちらも尊重されます。OpenRelay と MCode が異なる作業ディレクトリで起動する可能性があるため、相対パスによる上書きは拒否されます。

## MiniMax CLI (`mmx`)

公式 CLI は別途インストールします。

```bash
npm install -g mmx-cli
mmx --version
```

ラッパーと OpenRelay のモデル ID を使ってテキストコマンドをルーティングします。

```bash
orl mmx text chat \
  --model anthropic/claude-opus-5 \
  --message "Explain this function"

orl mmx --output json text chat \
  --model openai/gpt-5.6-sol \
  --message "Return a JSON summary"
```

MMX は API ベース URL の下に `/anthropic/v1/messages` を固定して使います。ラッパーは子プロセスの実行中だけ一時的なループバックブリッジを起動します。ブリッジは、その Messages パスと `/anthropic/v1/messages/count_tokens` への POST のみを受け付け、リクエスト本文とクエリを維持しながら、OpenRelay の既存の `/v1/messages` と `/v1/messages/count_tokens` データプレーンへ対応付けます。OpenRelay の正規のリクエスト変換、使用量計上、設定済みの下流プロバイダー認証は引き続き適用されます。プロバイダーには設定に応じて `x-api-key` またはベアラー認証が送られます。ストリーミングでは Anthropic のメッセージとコンテンツイベントを維持します。転送前に、ブリッジは受信した受け入れ用認証ヘッダーを除去し、公開用の `opencodex-loopback` プレースホルダーを固定します。任意の Anthropic リソースはプロキシせず、ブリッジをループバック外へ公開することもありません。

ラッパーはプレースホルダーだけを含む一時的な `MMX_CONFIG_DIR` も作成し、`mmx` の終了後に削除します。`~/.mmx/config.json`、OAuth トークン、MiniMax API キーは読み込まず、コピーもしません。

次の制限は意図的なものです。

- OpenRelay 経由でルーティングするのは `text chat` と `text repl` のみです。
- `--api-key`、`--base-url`、`--region` はラッパーが拒否します。呼び出し元の認証情報や接続先指定が独立したブリッジと衝突しないためです。
- MMX はリモートバインドに必要な OpenRelay 専用の `x-opencodex-api-key` 受け入れヘッダーを送れないため、ラッパーはループバック専用です。
- `image`、`video`、`speech`、`music`、`vision`、`search`、`quota`、`auth`、`config`、`file`、`update` には通常の `mmx` を実行してください。これらは OpenRelay が模倣しない MiniMax 固有の API を呼びます。

`mmx` のテキストモデルのデフォルトは `MiniMax-M3` です。特定の OpenRelay ルートを使う場合は `--model <provider/model>` を渡します。指定しない場合は、通常の OpenRelay モデルルーティング規則によってデフォルト ID の利用可否が決まります。
