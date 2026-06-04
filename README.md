## 今回の目的

アプリケーションコンテナからの外部通信（Egress通信）において、「最小権限の原則（ゼロトラスト）」を実現すること。

従来の「社内ネットワークから1つの巨大なプロキシを経由させる」集約型の構成ではなく、**「アプリごとに専用のプロキシ（サイドカー）を配置し、許可リストを完全に分離する」** アーキテクチャの構築を目指しました。

本構成最大の目的は、**システムがスケール（拡張）した際にも、権限の肥大化を防ぎ、最小権限を維持し続けること**です。

[![CI - Proxy Test](https://github.com/inugasuki44/egress-proxy-portfolio/actions/workflows/main.yml/badge.svg)](https://github.com/inugasuki44/egress-proxy-portfolio/actions)

Plaintext

```
▼ 従来型：集約プロキシの課題
（アプリがスケールすると1つのProxyに通信が集中。設定ミスでAがBの権限を使うリスクがある）

   [App-A] ─┐
   [App-A] ─┤     巨大なプロキシ
            ├──▶ [ Shared-Proxy ] ──▶ (Internet)
   [App-B] ─┤   (AとB両方の許可リストを持つ)
   [App-B] ─┘


▼ 今回の構成：サイドカー型プロキシ
（アプリのスケールと共に専用プロキシもセットで増殖。VLAN分割により権限は完全に独立）

   [App-A] ──▶ [Proxy-A] ──▶ (Internet: httpbin.orgのみ許可)
   [App-A] ──▶ [Proxy-A] ──▶ (Internet: httpbin.orgのみ許可)
   
   =================== 越えられない壁 (VLAN: net-a と net-b) ===================
   
   [App-B] ──▶ [Proxy-B] ──▶ (Internet: example.comのみ許可)
   [App-B] ──▶ [Proxy-B] ──▶ (Internet: example.comのみ許可)
```


このネットワーク隔離と通信テストが正しいことを証明するため、GitHub Actionsを用いた自動テスト（CI）環境を構築しています。

## 目次

1. 実行結果
    
2. 実行環境
    
3. 思考フローと問い
    
4. 開発中の気づき
    
5. コード全文
    
6. コードの詳細な解説
    
7. 実行方法
    
8. まとめ
    

## 1. 実行結果

GitHub Actions上で構築された隔離ネットワークにて、App-AとApp-Bがそれぞれ独立したProxyを経由し、意図したドメインのみ通信が許可される（他は403でブロックされる）ことを確認しました。

Plaintext

```
--- App-A の Egressプロキシ通信テストを開始します ---
使用プロキシ: http://proxy-a:3128

宛先: http://httpbin.org/get (許可リスト対象)
✅ 結果: 通信成功 (Status: 200)
----------------------------------------
宛先: https://yahoo.co.jp (許可リスト対象外)
✅ 結果: 想定通りブロックされました (Status: 403)

--- App-B の Egressプロキシ通信テストを開始します ---
使用プロキシ: http://proxy-b:3128

宛先: http://example.com (許可リスト対象)
✅ 結果: 通信成功 (Status: 200)
----------------------------------------
宛先: https://yahoo.co.jp (許可リスト対象外)
✅ 結果: 想定通りブロックされました (Status: 403)
```

## 2. 実行環境

|**項目**|**詳細**|
|---|---|
|**CI/CD環境**|GitHub Actions (ubuntu-latest)|
|**コンテナ技術**|Docker, Docker Compose|
|**Proxyサーバー**|Squid (`ubuntu/squid:latest`)|
|**Appサーバー**|Node.js (20-alpine)|
|**外部ライブラリ**|`axios`, `http-proxy-agent`, `https-proxy-agent`|
|**JSON処理**|`jq` コマンド|

## 3. 思考フローと問い

**【背景と課題】**

最初は「Appコンテナ -> 1つのSquidコンテナ」という単純な構成でアクセス制御を検証していました。しかし、実運用環境（マイクロサービス等）を想定した場合、1つのプロキシを複数のアプリで共有すると、設定ミスによる権限昇格や、1つのアプリが乗っ取られた際の横展開（ラテラルムーブメント）のリスクが生じるのではないか懸念が生じました。

**【問い】**

「アプリごとにアクセス先を限定し、完全に影響範囲を分離するにはどう設計すべきか？」

**【解決策】**

Kubernetes等のモダンインフラで採用される「サイドカー・パターン」を採用しました。

- アプリAにはプロキシA、アプリBにはプロキシBを1対1でデプロイする。
    
- マスターデータ（JSON）もアプリごとに分離し、運用時の競合（コンフリクト）を防ぐ。
    
- Dockerの仮想ネットワークを分離し、インフラレベルで他コンテナへの通信を物理的に遮断する。
    

## 4. 開発中の気づき

- **コンテナネットワークならではの通信影響 (デフォルトブリッジ)**
    
    Docker Composeで複数コンテナを立ち上げると、デフォルトで全てのコンテナが同じネットワークに所属してしまいます。環境変数でプロキシの向き先を変えるだけでは不正アクセスによる横展開に対応が不十分であるため、`networks:` を明示的に定義してネットワーク空間自体を分割してゼロトラストを実現できる事に気付きました。
    
- **YAMLのインデントとJavaScriptのシンタックス**
    
    `services.image must be a mapping` というDockerのエラーが単なるインデントズレであったことや、Node.jsのテンプレートリテラル（バッククォートとシングルクォートの違い）による予期せぬDNSエラー（`EAI_AGAIN`）など、コードの些細な構文が構成全体に影響するパターンを実体験から学習しました。
    
- **CI環境におけるコンテナ制御**
    
    CI上で複数コンテナのテストを行う際、`--abort-on-container-exit` を使うと他のテストが巻き添えで終了してしまいます。プロキシ群をバックグラウンド（`-d`）で起動し、テスト用コンテナを順次 `run --rm` で実行していくアプローチをとることで、確実なテスト実行とクリーンなログ出力を実現できました。
    

## 5. コード全文

### マスターデータ（許可リスト）

**`allow-list-a.json`**

JSON

```
{
  "allowed_domains": [
    "httpbin.org"
  ]
}
```

**`allow-list-b.json`**

JSON

```
{
  "allowed_domains": [
    "example.com"
  ]
}
```

### Docker Compose設計図

**`docker-compose.yml`**

YAML

```
services:
  # === App-A セット ===
  proxy-a:
    image: ubuntu/squid:latest
    container_name: egress-proxy-a
    volumes:
      - ./proxy/squid.conf:/etc/squid/squid.conf:ro
      - ./allow-list-a.txt:/etc/squid/allow-list.txt:ro
    networks:
      - net-a

  app-a:
    build: ./app
    container_name: egress-app-a
    depends_on:
      - proxy-a
    environment:
      - APP_NAME=App-A
      - HTTP_PROXY=http://proxy-a:3128
      - TARGET_URL=http://httpbin.org/get
    networks:
      - net-a

  # === App-B セット ===
  proxy-b:
    image: ubuntu/squid:latest
    container_name: egress-proxy-b
    volumes:
      - ./proxy/squid.conf:/etc/squid/squid.conf:ro
      - ./allow-list-b.txt:/etc/squid/allow-list.txt:ro
    networks:
      - net-b

  app-b:
    build: ./app
    container_name: egress-app-b
    depends_on:
      - proxy-b
    environment:
      - APP_NAME=App-B
      - HTTP_PROXY=http://proxy-b:3128
      - TARGET_URL=http://example.com
    networks:
      - net-b

networks:
  net-a:
  net-b:
```

_(※ `app/index.js` および `.github/workflows/main.yml` については、リポジトリ内のソースコードを参照してください)_

## 6. コードの詳細な解説

### インフラ層（Docker Compose）の工夫

- **ポート開放の廃止:** `ports: - "3128:3128"` の設定を削除し、ホストOSからのアクセス経路を完全に塞ぎました。通信は全て閉域ネットワーク(仮想ネットワーク `net-a`, `net-b`）内でのみ完結します。
    
- **コンポーネントの再利用:** Squidコンテナ自体のDockerfileは作成せず、公式イメージをそのまま使用しています。`volumes` を用いて、AとBそれぞれのテキストリストをコンテナ内の同じパス（`/etc/squid/allow-list.txt`）にマウントすることで、共通の `squid.conf` を使い回せる設計にしています。
    

### アプリケーション層（Node.js）の工夫

- **環境変数設計:** `index.js` のソースコード内にプロキシのURLや通信先をハードコードせず、すべて `process.env` を通じて外部（Docker Compose）から注入する汎用的なスクリプトに変更しました。これにより、1つのソースコードでApp-AとApp-Bの異なる振る舞いを制御しています。
    

### CI層（GitHub Actions）の工夫

- **JSONからTXTへの自動変換:** 人間が管理しやすいJSONファイルをマスターデータとし、CIのパイプライン上で `jq` コマンドを用いてSquidが読み取れるフラットなテキストファイルに動的変換しています。
    

## 7. 実行方法

本構成は完全にCI/CDドリブンで動作します。

1. リポジトリの `allow-list-a.json` または `allow-list-b.json` を編集し、コミットします。
    
2. GitHubの `main` ブランチにPushすると、自動的にGitHub Actionsがトリガーされます。
    
3. Actionsの `Run Egress Proxy Test` ログにて、各コンテナの通信テスト結果を確認できます。
