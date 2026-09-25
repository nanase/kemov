# 設定とデプロイ

Cloudflare と GitHub の設定、R2 のバケットの作成、デプロイの戻し方の手順です。デプロイの工程とその順序の理由は [全体の構成](../reference/architecture.md#デプロイ) にあります。

## アカウント ID

`wrangler.toml` は D1 の `database_id` を持ちますが、`account_id` は持ちません。このリポジトリは公開されており、その値はアカウントを特定するためです。

Cloudflare へ届くもの、つまり `wrangler deploy` と `--remote` を付けたコマンドは、`wrangler login` がホームディレクトリに残したセッションからアカウントを決めます。GitHub Actions は、environment のシークレットからアカウントを受け取ります（[GitHub の environment](#github-の-environment)）。

## worker のシークレット

シークレットの値は、このリポジトリのどこにも置きません。`wrangler.toml` にも、ワークフローのファイルにも、`.env` にも置きません。`wrangler.toml` はバインディングの名前を書くだけで、値は持ちません。

値は Cloudflare に保存し、`wrangler` で登録します。コマンドはリポジトリのルートで実行します。`wrangler` は `PATH` にあるものではなく devDependency なので、`bun wrangler` と打ちます。

```sh
bun wrangler secret put YOUTUBE_API_KEY   # 値を尋ねるので、シェルの履歴に残らない
bun wrangler secret list                  # 名前だけを出し、値は出さない
```

シークレットは既にある worker に属するので、先に 1 回 `bun wrangler deploy` を済ませておきます。worker が無いうちは、wrangler が `Worker "kemov" not found` と答えます。

値を端末に通したくなければ、ダッシュボードからも登録できます。Workers & Pages → `kemov` → Settings → Variables and Secrets → Add と進み、種類に Secret を選びます。

| シークレット      | 読むもの                        |
| ----------------- | ------------------------------- |
| `YOUTUBE_API_KEY` | 収集のジョブ（#62〜#65）        |
| `ACCESS_AUD`      | `/admin/api` の前の検証（#144） |

`Deploy` ワークフローは、worker が読むシークレットがすべて登録されているかを確かめ、1 つでも無ければ失敗します。

- 何がシークレットかは、「無いこと」で決まる
  - `worker/src/lib/env.ts` の `Env` のメンバーのうち、`wrangler.toml` がバインディングにも `[vars]` にもしていないものがシークレット
  - `Env` にメンバーを足せば、それだけで確認の対象になる
- 確認はデプロイの後に行う
  - どちらの側でも、扱うのは名前だけ
- シークレットが無くても、デプロイは止まらない
  - wrangler はバインディングを解決するだけで、シークレットを見ないため
  - この確認ができる前は、worker はデプロイされ、ジョブが D1 の中で 1 つずつ失敗した。その記録が #89

手元で動かすときは、同じ名前をリポジトリのルートの `.dev.vars` に `NAME=value` の行で書きます。`.dev.vars` と `.dev.vars.*` は git が無視します。

`.env` はこれとは別物で、わざとコミットしています。Vite が公開するバンドルに埋め込むので、中身は既に公開されています。`wrangler dev` もこのファイルを読んで worker に渡します。これも、シークレットを置いてはならない理由です。

## ホスト名

`wrangler.toml` は `kemov.nanase.cc` をカスタムドメインとして宣言しています。そのため、ゾーンの DNS レコードは手ではなく Cloudflare が作成し、管理します。

`workers_dev` は無効にしてあります。

- Cloudflare が worker に付けるサブドメインは、アカウントのメールアドレスから作られ、ローカル部がそのまま入る
- デプロイが成功すると、その URL を GitHub Actions のログに出す。公開リポジトリのログは誰でも読める
- カスタムドメインがあれば、そのサブドメインを使うものは無い
- カスタムドメインが設定される前に無効にしてはならない。それまでは、worker に届く道はこのサブドメインしか無い

旧 URL の `nanase.cc/kemov/` 以下から `kemov.nanase.cc` への転送は、このリポジトリの外、`nanase.cc` のゾーンにあります（#72）。

## GitHub の environment

デプロイの資格情報は、リポジトリのシークレットではなく、GitHub の environment から受け取ります。environment のシークレットは、その environment を名指しするジョブしか読めません。リポジトリのシークレットは、PR のブランチから動くものを含め、リポジトリのすべてのワークフローが読めます。そのほとんどは、デプロイできるトークンを持つ必要がありません。

| 設定                | 値                                              |
| ------------------- | ----------------------------------------------- |
| Environment         | `cloudflare`                                    |
| Deployment branches | `main` だけ                                     |
| Secrets             | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` |

1. Settings → Environments → New environment と進み、名前を `cloudflare` にする
2. Deployment branches で「Selected branches and tags」を選び、`main` を足す
3. Add environment secret で、上の 2 つの名前をそれぞれ登録する

トークンは「Edit Cloudflare Workers」のテンプレートに D1 Edit を足したものにします。worker が D1 のバインディングを持つので D1 Edit を使います。カスタムドメインの管理は、テンプレートに含まれる Workers Routes の権限で足ります（#216）。

## ブランチの保護

`main` のブランチの保護は、2026-09-24 の時点で次のとおりです。

| 項目                        | 設定    |
| --------------------------- | ------- |
| PR を必須にする             | 有効    |
| 必要な承認の数              | 0       |
| 必須のステータスチェック    | `check` |
| ブランチを最新に保つ        | 無効    |
| 会話の解決を必須にする      | 有効    |
| force push とブランチの削除 | 禁止    |
| 管理者にも強制する          | 無効    |

設定の理由は #58 にあります。

- 承認の数を 0 にしているのは、自分の PR を自分で承認できないため
- 管理者に強制しないのは、緊急時の退路を残すため
- 必須のチェックは `check` だけ
  - `Deploy` ワークフローのジョブは PR では動かないので、必須にすると PR では永久に満たされない

## バックアップのバケットの保持期間

`kemov-backup` の prefix ごとのライフサイクルルールを設定します。どの prefix を何日にするかと、その理由は [データ](../reference/data.md#保持期間) にあります。

`lifecycle add` を、リポジトリのルートで実行します。

- `channel/` に規則が既にあるときは、並べて足すのではなく置き換える。1 つの prefix には規則を 1 つしか置けないため
  - 先に `lifecycle list` で今ある規則の名前を確かめ、その規則だけを `remove` する。無い名前を `remove` すると、エラーで止まる
  - `channel/` の規則の名前は、`expire-channel-30d`、`expire-channel-365d`、`expire-channel-27d`（#224）と変わってきた。下のコマンドは、今ある規則が `expire-channel-365d` の場合である
- `-y` は、`add` が尋ねる確認を飛ばす。確認が出ると、ループが途中で止まる

```sh
bun wrangler r2 bucket lifecycle add kemov-backup expire-video-30d video/ --expire-days 30 -y
bun wrangler r2 bucket lifecycle remove kemov-backup --name expire-channel-365d
bun wrangler r2 bucket lifecycle add kemov-backup expire-channel-27d channel/ --expire-days 27 -y
bun wrangler r2 bucket lifecycle add kemov-backup expire-channel-snapshot-365d channel_snapshot/ --expire-days 365 -y

for t in channel_snapshot_exclusion video_override footprints_event footprints_event_member footprints_event_source \
         source_whitelist genet_person genet_tune genet_tune_attribute genet_tune_attribute_person genet_tune_video genet_tune_score \
         genet_stream genet_performance genet_scene revision publication; do
  bun wrangler r2 bucket lifecycle add kemov-backup "expire-${t//_/-}-365d" "$t/" --expire-days 365 -y
done
```

`lifecycle set --file <json>` は使いません。`set` はバケットの規則をまるごと置き換えるので、そのファイルに書き忘れると、もとからある「Default Multipart Abort Rule」（7 日、すべての prefix）が消えます。`add` と `remove` は名指しした 1 つの規則にしか触れないので、上のコマンドはその規則に触れません。

prefix の末尾のスラッシュは省けません。`genet_tune` を prefix にすると `genet_tune_attribute/` にも一致し、`video` は `video_override/` にも一致します。どちらも誤った保持期間で消えてしまいます。上の prefix がすべて `/` で終わるのはこのためです。

`bun wrangler r2 bucket lifecycle list kemov-backup` で確かめます。上で足した 20 個と、もとからある Default Multipart Abort Rule の、計 21 個が並ぶはずです。

## 公開用のバケット

`kemov-public` は、一度作るまで存在しません。このバケットをバインドするコードをデプロイする前に作ります。

```sh
bun wrangler r2 bucket create kemov-public
```

## デプロイの戻し方

戻し方は 2 つあります。デプロイしたものが既に壊れているなら、先に `wrangler rollback` ですぐ戻し、そのあとコミットを revert します。

どちらの方法でも、D1 に適用したマイグレーションとデータは戻りません。スキーマを戻すときは [復旧](recovery.md#ロールバック) を見てください。

### すぐに戻す: `wrangler rollback`

Cloudflare に残っている前の版の worker へ切り替えます。リポジトリは変わらないので、次に `main` へ push するとまたデプロイされます。

```sh
bun wrangler deployments list                               # 直近のデプロイと、その版の ID を見る
bun wrangler rollback <version-id> --message "<戻す理由>"   # 戻す先の版を指定して戻す
```

### コミットを戻す: revert

`main` は PR を必須にしているので、revert も PR で入れます。マージすると `Deploy` ワークフローがデプロイし直します。

```sh
git switch -c revert-<topic> origin/main
git revert <commit>
git push -u origin revert-<topic>
gh pr create --fill
```

コードを変えずに、いまの `main` をデプロイし直すだけなら、ワークフローを手で動かします。

```sh
gh workflow run Deploy --ref main
```
