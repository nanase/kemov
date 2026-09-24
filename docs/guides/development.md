# 開発

手元でサイトと worker を動かし、検査するときの手順です。

## 準備

`package.json` の `engines` が npm を禁じているので、`npm install` は失敗します。bun を使ってください。

Node と bun の版は `mise.toml` で固定しています。[mise](https://mise.jdx.dev/) を使えば、固定した版が入り、自動で切り替わります。

```sh
mise install
```

続けて依存を入れます。

```sh
bun install --frozen-lockfile
```

## 環境変数

`.env` には、公開サイトをビルドするときの値が入っています。開発中に接続先を変えたいときは、`.env.development.local` に上書きの値を書きます。

`.env.local` は使いません。Vite はどのモードでもこのファイルを読むので、ここに残した値は本番のビルドにも入り、閲覧者へ届いてしまいます。

| 変数             | 使う箇所             | 備考                              |
| ---------------- | -------------------- | --------------------------------- |
| `VITE_API_PROXY` | 公開サイトの各ページ | `vite dev` でだけ使う（次を参照） |
| `VITE_API_BASE`  | 公開サイトの各ページ | `vite dev` でだけ使う（次を参照） |

本番ではどちらも設定せず、ページは同じオリジンの `/api` を読みます。API を返す worker が、ページも配信しているためです。`bun run dev` では vite がポート 5173 でページを配信し、worker は動いていません。そこで、`/api` の転送先を開発サーバーに設定します。

```sh
echo 'VITE_API_PROXY=https://kemov.nanase.cc' >> .env.development.local
```

ページは同じオリジンを読み続け、vite がその要求を転送します。API は `Access-Control-Allow-Origin` を返さないので、ページが別のホストを直接読むと、応答はすべてブラウザに拒まれます。転送を挟むのはこのためです。`wrangler dev` を相手にするときも同じで、`VITE_API_PROXY=http://localhost:8787` とします。

`VITE_API_BASE` は古い設定で、ページから別のホストを直接読ませます。相手のホストがこのオリジンを許可している場合にしか使えず、本番の worker は許可していません。`VITE_API_PROXY` を使ってください。

開発サーバーは起動時に `.env.development.local` を読みます。書き換えたら開発サーバーを起動し直してください。

シェルに同じ名前の環境変数があると、ファイルより先にそちらが使われます。ファイルの値を効かせたいときは、先に外してから起動します。

```sh
unset VITE_API_PROXY
bun run dev
```

## 開発サーバー

既定の URL は http://localhost:5173/stats/ です。

```sh
bun run dev
```

## 本番用のビルド

型検査・ビルド・圧縮をまとめて行います。

```sh
bun run build
```

## ビルド結果のプレビュー

既定の URL は http://localhost:4173/stats/ です。

```sh
bun run preview
```

## スクリーンショット

見た目の変更をレビューに出すときは、Playwright でスクリーンショットを撮ります。Playwright は専用の Chromium を持ち、マシンで開いている他のブラウザとは別に動きます。そのため後始末は `browser.close()` だけで済みます。この区別が大事な理由は #120 にあります。

`bun install` はブラウザを取ってきません。マシンごとに 1 回、次を実行します。

```sh
bunx playwright install chromium
```

そのうえで、`bun run preview`（ポート 4173）か `bun run dev`（ポート 5173）でページを配信しながら撮ります。

```sh
bun run screenshot screenshots stats=http://localhost:4173/stats/ videos=http://localhost:4173/videos/
```

`<name>=<url>` の組ごとに、幅と配色の組み合わせ 1 つにつき 1 枚、`screenshots/<name>-<light|dark>-<390|768|1280>.png` ができます。`screenshots/` は git の管理外なので、このスクリプトが書いたものはコミットされません。

## lint と整形

### [ESLint](https://eslint.org/) による lint

```sh
bun run lint
```

### [Stylelint](https://stylelint.io/) による CSS の lint

```sh
bun run lint:style
```

### [Prettier](https://prettier.io/) による整形

`.prettierrc.json` はリポジトリ全体に効き、CI も全体を検査します。そのため `bun run format` も全体を書き換えます。どちらも git が無視するファイルには触れません。

```sh
bun run format                 # 書き換える
bun run prettier --check .     # CI が実行するもの
```

## worker の開発

worker は workerd の上で動き、tsconfig の `lib`・グローバルの型・パスの別名をフロントエンドと共有しません。そのため `worker/tsconfig.json` と vitest のプロジェクトを別に持っています。

```sh
bun run type-check          # フロントエンド
bun run type-check:worker   # worker
bun run test                # すべてのプロジェクト
bun run vitest run --project worker   # worker だけ
```

Cloudflare へ届くコマンドは、`wrangler login` が残したセッションからアカウントを決めます。`wrangler.toml` にアカウント ID を置かない理由は [設定とデプロイ](deployment.md#アカウント-id) にあります。

```sh
bun wrangler login                                        # マシンごとに 1 回
bun wrangler d1 execute DB --remote --command "select 1"
```

`--local` を付けると、アカウントもネットワークも使いません。`.wrangler/` の下にある SQLite のデータベースを相手に動きます。

```sh
bun wrangler d1 execute DB --local --command "select 1"
```
