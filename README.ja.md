# Google Calendar MCP Server

---

**このリポジトリは [takumi0706/google-calendar-mcp](https://github.com/takumi0706/google-calendar-mcp) v1.0.6 のフォークおよび機能拡張版です。オリジナルの作者に感謝いたします。**

**主な違い: このバージョンでは取得したGoogle認証トークンをローカルファイルに保存するため、使用するたびに認証する必要がありません。**

**セキュリティには十分注意してください。トークンと暗号化キーは厳重に管理し、第三者に漏洩しないようにしてください。**

---

## プロジェクト概要

Google Calendar MCP Serverは、Google CalendarとClaude Desktopの連携を可能にするMCP（Model Context Protocol）サーバー実装です。このプロジェクトにより、ClaudeがユーザーのGoogle Calendarと対話し、自然言語でカレンダーイベントの表示、作成、更新、削除を行うことができます。

### 主な機能

- **Google Calendar連携**: Claude DesktopとGoogle Calendar APIの橋渡しを提供
- **MCP実装**: AIアシスタントツール連携のためのModel Context Protocol仕様に準拠
- **OAuth2認証**: Google API認証フローを安全に処理
- **イベント管理**: カレンダーイベント操作（取得、作成、更新、削除）を包括的にサポート
- **カラーサポート**: colorIdパラメータを使用したイベントカラーの設定・更新機能
- **STDIO通信**: Claude Desktopとの通信に標準入出力を使用

## 技術アーキテクチャ

このプロジェクトで使用している技術:

- **TypeScript**: 型安全なコード開発
- **MCP SDK**: Claude Desktopとの連携に`@modelcontextprotocol/sdk`を使用
- **Google API**: Google Calendar APIアクセスに`googleapis`を使用
- **Zod**: リクエスト/レスポンスデータのスキーマ検証を実装
- **環境ベースの設定**: 設定管理にdotenvを使用
- **Helmet.js**: セキュリティヘッダー用
- **AES-256-GCM**: トークン暗号化用
- **Jest**: ユニットテストとカバレッジ用
- **GitHub Actions**: CI/CD用

## 主要コンポーネント

1. **MCP Server**: Claude Desktopとの通信を処理するコアサーバー実装
2. **Google Calendar Tools**: カレンダー操作（取得、作成、更新、削除）
3. **Authentication Handler**: Google APIとのOAuth2フロー管理
4. **Schema Validation**: すべての操作におけるデータ整合性の確保
5. **Token Manager**: 認証トークンの安全な取り扱い

## 利用可能なツール

このMCPサーバーは、Google Calendarと連携するための以下のツールを提供します：

### 1. getEvents

様々なフィルタリングオプションでカレンダーイベントを取得します。

**パラメータ:**

- `calendarId`（任意）: カレンダーID（省略時はプライマリカレンダーを使用）
- `timeMin`（任意）: イベント取得の開始時刻（ISO 8601形式、例: "2025-03-01T00:00:00Z"）
- `timeMax`（任意）: イベント取得の終了時刻（ISO 8601形式）
- `maxResults`（任意）: 取得するイベントの最大数（デフォルト: 10）
- `orderBy`（任意）: ソート順（"startTime"または"updated"）

### 2. createEvent

新しいカレンダーイベントを作成します。

**パラメータ:**

- `calendarId`（任意）: カレンダーID（省略時はプライマリカレンダーを使用）
- `event`: イベント詳細オブジェクト:
  - `summary`（必須）: イベントタイトル
  - `description`（任意）: イベントの説明
  - `location`（任意）: イベントの場所
  - `start`: 開始時刻オブジェクト:
    - `dateTime`（任意）: ISO 8601形式（例: "2025-03-15T09:00:00+09:00"）
    - `date`（任意）: 終日イベント用のYYYY-MM-DD形式
    - `timeZone`（任意）: タイムゾーン（例: "Asia/Tokyo"）
  - `end`: 終了時刻オブジェクト（startと同じ形式）
  - `attendees`（任意）: emailとオプションのdisplayNameを持つ参加者の配列
  - `colorId`（任意）: イベントカラーID（1-11）
  - `recurrence`（任意）: RFC5545形式の繰り返しルール配列（例: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]）

### 3. updateEvent

既存のカレンダーイベントを更新します。この関数は既存のイベントデータを先に取得し、更新データとマージすることで、更新リクエストに含まれていないフィールドを保持します。

**パラメータ:**

- `calendarId`（任意）: カレンダーID（省略時はプライマリカレンダーを使用）
- `eventId`（必須）: 更新するイベントのID
- `event`: 更新するフィールドを含むイベント詳細オブジェクト（createEventと同じ構造、すべてのフィールドは任意）
  - 明示的に提供されたフィールドのみが更新されます
  - 更新リクエストに含まれていないフィールドは既存の値を保持します
  - これにより、データを失うことなく部分的な更新が可能です
  - `recurrence`パラメータを更新して繰り返しイベントのパターンを変更できます

### 4. deleteEvent

カレンダーイベントを削除します。

**パラメータ:**

- `calendarId`（任意）: カレンダーID（省略時はプライマリカレンダーを使用）
- `eventId`（必須）: 削除するイベントのID

### 5. authenticate

Google Calendarで再認証を行います。Claudeを再起動せずに別のGoogleアカウントに切り替えたい場合に便利です。

**パラメータ:**

- `force`（任意）: trueに設定すると強制的に再認証を行います（Googleアカウントを切り替える場合に使用）

## 開発ガイドライン

新機能の追加、コードの修正、バグ修正を行う際は、変更ごとに`npm version`コマンドを使用してセマンティックバージョニングを行ってください。
また、OOPなどの必要なコーディングルールに従い、明確なコーディングを心がけてください。
コードを提出する前に、ビルド、lint、テストを実行してください。

### コード構造

- **src/**: ソースコードディレクトリ
  - **auth/**: 認証処理
  - **config/**: 設定
  - **mcp/**: MCPサーバー実装とツール定義
  - **calendar/**: Google Calendar APIラッパーと型定義
  - **utils/**: ユーティリティ関数とヘルパー

### ベストプラクティス

- TypeScriptのベストプラクティスに従った適切な型付け
- 包括的なエラーハンドリングの維持
- 適切な認証フローの確保
- 依存関係を最新に保つ
- すべての関数に明確なドキュメントを記述
- セキュリティのベストプラクティスを実装
- OAuth 2.1認証標準に従う
- すべての入出力データにスキーマ検証を使用

### テスト

- コア機能のユニットテストを実装
- 認証フローを徹底的にテスト
- Google APIに対するカレンダー操作を検証
- カバレッジレポート付きでテストを実行
- セキュリティテストを含める

## デプロイ

このパッケージは`@naotaka/google-calendar-mcp`としてnpmで公開されています：

```bash
npx @naotaka/google-calendar-mcp@latest
```

### 前提条件

1. Google Cloudプロジェクトを作成し、Google Calendar APIを有効化
2. Google Cloud ConsoleでOAuth2認証情報を設定
3. 環境変数を設定:

```bash
# Google OAuth認証情報を含む.envファイルを作成
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4153/oauth2callback

# オプション: 認証サーバーのポートとホスト（デフォルトポート: 4153、ホスト: localhost）
AUTH_PORT=4153
AUTH_HOST=localhost
# オプション: MCPサーバーのポートとホスト（デフォルトポート: 3000、ホスト: localhost）
PORT=3000
HOST=localhost
# オプション: 手動認証を有効化（localhostにアクセスできない場合に便利）
# USE_MANUAL_AUTH=true
# オプション: トークン暗号化キー（設定しない場合は自動生成）
# TOKEN_ENCRYPTION_KEY=your_64_character_hex_string
```

### Claude Desktop設定

`claude_desktop_config.json`にサーバーを追加:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "@naotaka/google-calendar-mcp@latest"
      ],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id",
        "GOOGLE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:4153/oauth2callback"
      }
    }
  }
}
```

**認証の永続化**: サーバーは初回実行時に暗号化キーを自動生成し、`~/.google-calendar-mcp/encryption-key.txt`に保存します。これにより、追加の設定なしでClaude Desktopの再起動後も認証が維持されます。

**オプション設定**:

- localhostにアクセスできない環境（リモートサーバーやコンテナなど）で実行する場合は、`"USE_MANUAL_AUTH": "true"`を追加して手動コード入力を有効化
- `"AUTH_PORT": "4153"`で認証サーバーのポートをカスタマイズ可能（デフォルトは4153）
- 共有環境では、オプションで`"TOKEN_ENCRYPTION_KEY"`を設定して使用する暗号化キーを制御可能

## セキュリティに関する考慮事項

- **OAuthトークン**はAES-256-GCMで暗号化され、`~/.google-calendar-mcp/tokens.json`に永続化
- **暗号化キー**は自動生成され、0600パーミッションで`~/.google-calendar-mcp/encryption-key.txt`に保存
- **ファイルパーミッション**は制限することを推奨（`chmod 600 ~/.google-calendar-mcp/*`）
- **機密認証情報**は環境変数として提供する必要があります
- **PKCE実装**: 明示的なcode_verifierとcode_challenge生成
- **stateパラメータ検証**: CSRF保護用
- **セキュリティヘッダー**: Helmet.jsを使用して適用
- **レート制限**: APIエンドポイント保護用
- **入力検証**: Zodスキーマを使用
- `TOKEN_ENCRYPTION_KEY`環境変数を使用する場合は、秘密を保持し、バージョン管理にコミットしないでください

詳細は[SECURITY.md](SECURITY.md)を参照してください。

## メンテナンス

- Google Calendar APIとの互換性を維持するための定期的な更新
- バージョン更新はREADME.mdに記載
- ログはstdoutでのJSON-RPC通信に干渉しないよう、stderrに出力されます（ファイルには出力されません）

## トラブルシューティング

問題が発生した場合:

1. stderrの出力でログメッセージを確認（ログはファイルには書き込まれません）
2. Google OAuth認証情報が正しく設定されているか確認
3. Google Calendar APIへの十分な権限があるか確認
4. Claude Desktopの設定が正しいか確認

### よくあるエラー

- **再起動のたびに再認証が必要**: 通常、暗号化キーファイル（`~/.google-calendar-mcp/encryption-key.txt`）が削除されたことを意味します。キーは初回実行時に自動生成されますが、削除されるとトークンが読み取れなくなり、再認証が必要になります。
- **JSONパースエラー**: `Unexpected non-whitespace character after JSON at position 4 (line 1 column 5)`のようなエラーが表示される場合、通常は不正なJSON-RPCメッセージが原因です。この問題はバージョン0.6.7以降で修正されています。まだこのエラーが発生する場合は、最新バージョンに更新してください。
- **認証エラー**: Google OAuth認証情報を確認してください
- **無効なstateパラメータ**: 再認証時に`Authentication failed: Invalid state parameter`が表示される場合は、OAuthサーバーのライフサイクル管理が修正されたバージョン1.0.3以降に更新してください。古いバージョンでは、ポート4153を閉じてアプリケーションを再起動する必要があるかもしれません。
- **接続エラー**: サーバーのインスタンスが1つだけ実行されていることを確認してください
- **切断の問題**: サーバーがカスタムTCPソケットなしでMCPメッセージを適切に処理していることを確認してください
- **localhostにアクセスできない**: リモートサーバーやコンテナなど、localhostにアクセスできない環境でアプリケーションを実行している場合は、`USE_MANUAL_AUTH=true`を設定して手動認証を有効にしてください。これにより、アプリケーションを承認した後にGoogleが表示する認証コードを手動で入力できます。

## 開発

このプロジェクトに貢献するには:

```bash
# リポジトリをクローン
git clone https://github.com/naotaka3/google-calendar-mcp.git
cd google-calendar-mcp

# 依存関係をインストール
npm install

# 開発モードで実行
npm run dev
```

## テスト

テストを実行するには:

```bash
# すべてのテストを実行
npm test

# カバレッジレポート付きでテストを実行
npm run test:coverage
```

## ライセンス

MIT
