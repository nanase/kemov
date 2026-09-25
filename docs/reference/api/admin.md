# 管理サイトの API

`/admin/api` のエンドポイントです。Cloudflare Access の後ろにあり、worker も要求ごとに Access の署名を検証します（[管理サイト](../admin.md#admin-と-cloudflare-access)）。

どのパスとメソッドを受けるかは、`worker/src/admin/index.ts` が決めます。この文書の表はその写しです。

## 保存した時点で効くデータ

| メソッド | パス                                                          | 返すもの                                                                                      |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET      | `/admin/api/me`                                               | Cloudflare Access が識別した呼び出し元のメールアドレス                                        |
| GET      | `/admin/api/members`                                          | `channel` の全行                                                                              |
| POST     | `/admin/api/members`                                          | 一覧の末尾に足したメンバーの行。ID が既にあれば 409 を返します                                |
| PUT      | `/admin/api/members`                                          | 足した行と全員の表示順を 1 回の batch で保存した後の一覧。一覧が変わっていれば 409 を返します |
| PUT      | `/admin/api/members/<チャンネル ID>`                          | 人が直せる列（表示順を除く）を置き換えた後の行                                                |
| DELETE   | `/admin/api/members/<チャンネル ID>`                          | 取り除いたことを記録した版だけ。記録が付いていれば 409 を返します                             |
| GET      | `/admin/api/snapshot-exclusions`                              | `channel_snapshot_exclusion` の全行                                                           |
| PUT      | `/admin/api/snapshot-exclusions/<チャンネル ID>/<fetched_at>` | 作成または置き換えた後の除外                                                                  |
| DELETE   | `/admin/api/snapshot-exclusions/<チャンネル ID>/<fetched_at>` | 取り除いたことを記録した版だけ                                                                |
| GET      | `/admin/api/video-overrides`                                  | `video_override` の全行と、動画そのものの題                                                   |
| PUT      | `/admin/api/video-overrides/<動画 ID>`                        | 作成または置き換えた後の上書き                                                                |
| DELETE   | `/admin/api/video-overrides/<動画 ID>`                        | 取り除いたことを記録した版だけ                                                                |

`channel`・`video_override`・`channel_snapshot_exclusion` は、保存した時点で効きます（#141 の設計の決定 5）。この点で、公開の段を通る下記の `footprints_event` と `genet_stream` とは違います。

上の PUT と DELETE は、どれも変える行と同じ `db.batch` で `revision` に 1 行を記録します。組のうち片方の書き込みが失敗しても、行とその履歴が食い違いません。PUT は保存した行と一緒に `revisionId` を返し、DELETE は `revisionId` だけを返します。

例外は、メンバーの一覧を扱う `POST /admin/api/members` と `PUT /admin/api/members` です。この 2 つは、足した行と順番が変わった行ごとに `revision` に 1 行を、同じ `db.batch` で記録します。順番が変わらない行には何も記録しません。`revisionId` は返さず、POST は 201 で足した行を `member` に、PUT は保存した後の一覧を `members` に入れて返します。

PUT は、列を 1 つずつ直すのではなく、すべての列をまとめて置き換えます。

- そのエンドポイントが扱わない列を送ると、400 で拒む
- 本文に無い列は null として扱い、null にできない列なら 400 で拒む

保存のたびの `revision.body` は、`worker/src/lib/revision.ts` を通して作ります。中身は保存した行から、保存の時刻だけを表す列を除いたものです。JSON のキーは、行の列の順に並びます。

メンバーの版は、さらに `custom_url` と `thumbnail_url` も除きます。どちらも YouTube API から取った値で、持ってよいのは 30 日までです（[#222](https://github.com/nanase/kemov/issues/222)）。`revision` は追記だけで行を消せないので、はじめから写しません。この 2 列はメンバーの保存では変わらないので、版から読み取れることは減りません（[#224](https://github.com/nanase/kemov/issues/224)）。

## あしあと

| メソッド | パス                                                  | 返すもの                                                                     |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET      | `/admin/api/footprints/events`                        | `footprints_event` の全行と、それぞれのメンバーと出典                        |
| GET      | `/admin/api/footprints/events/<できごと ID>`          | 1 行と、そのメンバーと出典                                                   |
| POST     | `/admin/api/footprints/events`                        | `draft` で作成した後の行                                                     |
| PUT      | `/admin/api/footprints/events/<できごと ID>`          | 行・メンバー・出典を置き換えた後の行。`status` は変えない                    |
| DELETE   | `/admin/api/footprints/events/<できごと ID>`          | `{}`。`published` のできごとなら 409                                         |
| POST     | `/admin/api/footprints/events/<できごと ID>/publish`  | 検証し、`status` を `published` にした後の行                                 |
| POST     | `/admin/api/footprints/events/<できごと ID>/withdraw` | `status` を `draft` に戻した後の行                                           |
| GET      | `/admin/api/footprints/pending`                       | 公開した JSON にまだ入っていないできごとと、公開した後に行が変わったできごと |
| POST     | `/admin/api/footprints/publish`                       | 何かを公開したかどうかと、公開したならそのできごとの数                       |

`GET /admin/api/footprints/events` は、クエリパラメーターの `status` と `q`（`title` の部分文字列）で一覧を絞ります。

できごとは、保存した時点では効かず、公開の門を通ります。

- 作成・更新・削除は `revision` を記録しない
- `publish` と `withdraw` だけが、`status` の変更と同じ `db.batch` で `revision` を記録する

`POST .../publish` は、できごとに公開の条件が揃っていなければ、満たしていない条件をまとめて 400 で返します。条件は次のとおりです。

- `title` が空でない
- `sourcePending: false` なら、数に入る出典がある（[出典のホワイトリスト](#出典のホワイトリスト)）
- `videoId` が 11 文字

公開済みのできごとをもう一度公開しても構いません。`GET .../pending` が「変わった」と報告したできごとは、こうして今の行に合った `publish` の版を得ます。

`POST /admin/api/footprints/publish` は、最新の操作が `withdraw` でないできごとそれぞれの最新の `revision` から `footprints/events.json` を作り、`PUBLIC_DATA` に書きます。そのうえで、読んだ中で最も新しい `revision_id` を記録した `publication` の行を 1 つ足します。前回より新しいものが無ければ、何も書きません。

## 出典のホワイトリスト

`sourcePending: false` には、ホワイトリストに載った出典が 1 つあるか、別々のホストの出典が 2 つあることが必要です。

ホワイトリストは、単独で出典として十分な URL の前方一致の一覧です。載っているのは、プロジェクト自身のドメインとアカウント、提携先の告知、イベントの主催者、ファンの wiki 2 つなどです。

- 一覧の実体は `source_whitelist` の表で、`migrations/0008_add_source_whitelist.sql` が作る（#175）
  - 初期値は、コードが以前定数として持っていた 13 件
- `worker/src/lib/source-whitelist.ts` が、公開のたびに一覧を読む
- 判定は `isWhitelistedSource` が行う
  - 前方一致で、一致した後に続く文字も確かめる。`https://x.com/KEMOVP_staff_fake` は `https://x.com/KEMOVP_staff` に数えない
  - 一覧を引数で受け取り、何が数に入るかはその一覧だけで決まる

別々のホストの出典が 2 つあれば、どちらも載っていなくて構いません。同じホストの URL が 2 つ、たとえば YouTube の動画 2 本では、互いを繰り返しているだけなので足りません。

ホストは `new URL(url).hostname` から先頭の `www.` を除いたものです。`worker/src/lib/source-whitelist.ts` の `HOST_ALIASES` が、次を同じホストとみなします。同じ場所を別の書き方で指すと分かっているホストだけを載せています。

- `twitter.com` は `x.com`
- `youtu.be` と `m.youtube.com` は `youtube.com`

1 つの投稿や 1 つのアカウントを指す 2 つの URL は、1 つの出典として数えます。この読み替えはホストを数えるときだけに使い、ホワイトリストとの照合は URL の文字列そのもので行います。

| メソッド | パス                                   | 返すもの                                         |
| -------- | -------------------------------------- | ------------------------------------------------ |
| GET      | `/admin/api/source-whitelist`          | すべての項目。足した順                           |
| POST     | `/admin/api/source-whitelist`          | 足した後の項目。前方一致の文字列が既にあれば 409 |
| PUT      | `/admin/api/source-whitelist/<prefix>` | `note` を変えた後の項目。直せる列は `note` だけ  |
| DELETE   | `/admin/api/source-whitelist/<prefix>` | `{}`                                             |

`<prefix>` は、URL をパーセントエンコードして 1 つのパスの区切りに収めたものです。

保存した時点で効き、`revision` は記録しません。一覧は公開の門の設定で、公開するものではないためです。

項目を取り除くと、次に公開するときの判定が変わります。既に公開したものは変わりません。公開中のできごとは公開されたままで、その項目だけが出典を支えていたできごとは、次に誰かが公開するときに拒まれます。できごとがその項目を使っていても、取り除く操作は拒みません。

## ジェネット楽曲一覧

| メソッド | パス                                          | 返すもの                                                                       |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| GET      | `/admin/api/genet/people`                     | `genet_person` の全行                                                          |
| POST     | `/admin/api/genet/people`                     | 作成した後の行                                                                 |
| GET      | `/admin/api/genet/people/<人物 ID>`           | 1 行                                                                           |
| PUT      | `/admin/api/genet/people/<人物 ID>`           | 置き換えた後の行                                                               |
| DELETE   | `/admin/api/genet/people/<人物 ID>`           | `{}`。まだその人をクレジットする曲があれば 409                                 |
| GET      | `/admin/api/genet/tunes`                      | `genet_tune` の全行と、それぞれの属性・動画・楽譜                              |
| POST     | `/admin/api/genet/tunes`                      | 作成した後の行                                                                 |
| GET      | `/admin/api/genet/tunes/<曲 ID>`              | 1 行と、その属性・動画・楽譜                                                   |
| PUT      | `/admin/api/genet/tunes/<曲 ID>`              | 行・属性・動画・楽譜を置き換えた後の行                                         |
| DELETE   | `/admin/api/genet/tunes/<曲 ID>`              | `{}`。まだその曲を演奏する配信があれば 409                                     |
| GET      | `/admin/api/genet/streams`                    | `genet_stream` の全行と、それぞれの演奏とシーン                                |
| POST     | `/admin/api/genet/streams`                    | `draft` で作成した後の行                                                       |
| GET      | `/admin/api/genet/streams/<動画 ID>`          | 1 行と、その演奏とシーン                                                       |
| PUT      | `/admin/api/genet/streams/<動画 ID>`          | 行・演奏・シーンを置き換えた後の行。`status` は変えない                        |
| DELETE   | `/admin/api/genet/streams/<動画 ID>`          | `{}`。`published` の配信なら 409                                               |
| POST     | `/admin/api/genet/streams/<動画 ID>/publish`  | 配信と、演奏する曲・人物を検証し、`status` を `published` にした後の行         |
| POST     | `/admin/api/genet/streams/<動画 ID>/withdraw` | `status` を `draft` に戻した後の行                                             |
| GET      | `/admin/api/genet/pending`                    | 公開した JSON にまだ入っていない配信・曲・人物と、公開した後に行が変わったもの |
| POST     | `/admin/api/genet/publish`                    | 何かを公開したかどうかと、公開したなら配信・曲・人物それぞれの数               |

`GET /admin/api/genet/tunes` は `q`（`title` の部分文字列）で絞ります。`GET /admin/api/genet/streams` は、あしあとの一覧と同じく `status` と `q` で絞ります。

`genet_tune` と `genet_person` は、自分の `status` を持ちません。#141 の設計では、公開の門を持つのは `genet_stream` だけだからです。そのため、どちらを保存しても `revision` は記録しません。

配信を公開するときは、その配信・演奏するすべての曲・その曲がクレジットするすべての人物を、まとめて検証します。そのうえで、配信の `publish` の版と、自分の最新の版と一致しない曲・人物の `publish` の版を、1 つの `db.batch` で記録します。

`POST /admin/api/genet/streams/<動画 ID>/publish` は、あしあとの公開と同じく、満たしていない条件をまとめて 400 で返します。条件は次のとおりです。

- `title` が空でない
- `youtube` の配信なら、`videoId` が 11 文字
- `publishedAt` が正しい
- 演奏が 1 つ以上ある
- 演奏とシーンが指す曲・動画が存在する
  - 外部キーが保存の時点で既に止めるので、この API からは起こりえない
  - それでも二重の備えとして検査を残している
- 曲の属性が、`text` とクレジットする人物の両方を持っていない
- 曲の題と人物の名前が空でない

`POST /admin/api/genet/publish` は、最新の操作が `withdraw` でない配信それぞれの最新の `revision` から `genet/music.json` を作ります。曲と人物は、それらの配信の公開済みの本文が名指ししているものを含めます。作業中の表を読み直すのではありません。そのため、公開した後に配信から外した曲が、JSON に戻ってくることはありません。配信・曲・人物は、1 つの `publication` の行（`target = 'genet_music'`）を共有します。

JSON は `shape_version` と `channel_id` も持ちます。

- `shape_version` は、`genet-publish.ts` の `GENET_MUSIC_SHAPE_VERSION`
  - 公開の操作は、`publication` の行ではなく、保存済みの JSON そのものから版を読む
  - JSON の版がコードの版より古ければ、新しい版の履歴が無くても作り直す。`shape_version` の無い JSON は版 1 とみなす
  - JSON の形を変えたら、この定数を上げる。次の「いま公開する」で、公開の JSON に変更が届く
- `channel_id` は、ページが題の横にアイコンを描くチャンネル
  - `video` にある公開済みの YouTube の配信のうち、半数以上が属し、他のどのチャンネルよりも多いチャンネルを選ぶ
  - そうしたチャンネルが無ければ `null` で、ページは色の付いた丸のままになる

## 登録者数の節目

| メソッド | パス                                                   | 返すもの                                                           |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| GET      | `/admin/api/subscribers/milestones`                    | `subscriber_milestone` の全行と、それぞれの出典。達成の日の古い順  |
| GET      | `/admin/api/subscribers/milestones/<節目 ID>`          | 1 行と、その出典                                                   |
| POST     | `/admin/api/subscribers/milestones`                    | `draft` で作成した後の行                                           |
| PUT      | `/admin/api/subscribers/milestones/<節目 ID>`          | 行と出典を置き換えた後の行。`status` は変えない                    |
| DELETE   | `/admin/api/subscribers/milestones/<節目 ID>`          | `{}`。`published` の節目なら 409                                   |
| POST     | `/admin/api/subscribers/milestones/<節目 ID>/publish`  | 検証し、`status` を `published` にした後の行                       |
| POST     | `/admin/api/subscribers/milestones/<節目 ID>/withdraw` | `status` を `draft` に戻した後の行                                 |
| GET      | `/admin/api/subscribers/pending`                       | 「いま公開する」で JSON に入るものと、公開した後に行が変わった節目 |
| POST     | `/admin/api/subscribers/publish`                       | 何かを公開したかどうかと、公開したなら節目の数                     |

`GET /admin/api/subscribers/milestones` は、クエリパラメーターの `channelId` と `status` で一覧を絞ります。

節目は、あしあとと同じく公開の門を通ります（#225）。作成・更新・削除は `revision` を記録せず、`publish` と `withdraw` だけが記録します。

保存するときは、次を確かめます。

- `channelId` の行が `channel` にある
- `reachedDate` が `datePrecision` の形（`YYYY-MM-DD` か `YYYY-MM`）に合っている
- `subscriberCount` が 1 以上の整数
- `announcedBy` が `member`・`official`・`listener` のどれか
- `eventId` をつなぐなら、その出来事の `kind` が `milestone`
- 出典の `url` が、ホストを持つ `https://` の URL

`POST .../publish` は、満たしていない条件をまとめて 400 で返します。条件は次のとおりです。

- 出典が 1 つ以上ある
- `announcedBy` が `member` か `official` なら、出典が足りている
  - 足りる条件は、あしあとと同じ（[出典のホワイトリスト](#出典のホワイトリスト)）
- `announcedBy` が `listener` なら、そのリスナーの投稿 1 つで足りる
- つないだ出来事の `kind` が、今も `milestone`

節目につながった出来事は、`DELETE /admin/api/footprints/events/<できごと ID>` で消せません。409 を返します。先に節目の側でつなぎを外します。

`POST /admin/api/subscribers/publish` は、最新の操作が `withdraw` でない節目それぞれの最新の `revision` から `subscribers/milestones.json` を作り、`PUBLIC_DATA` に書きます。そのうえで `publication` の行（`target = 'subscriber_milestones'`）を 1 つ足します。あしあとの JSON とは別のファイルです。統計やメンバーのページが、あしあと全体を読まずに済むようにするためです。

公開の JSON は、`publish` の版の中身と次の 2 点が違います。

- `announced_by` が `listener` の節目は、`sources` を空にする
  - リスナーの投稿の URL は、版と管理サイトにだけ残す
- `event_id` の代わりに `event` を持つ
  - `event` は `{ event_id, title, start_date }` で、公開中のあしあとの JSON に載っている出来事の姿を写す
  - 出来事があしあとの JSON に載っていなければ `null`

そのため、あしあとの側で出来事を直して公開し直すと、節目の JSON の `event` が古くなります。`GET .../pending` はこれを `eventChanged` として返し、「いま公開する」は節目の版が新しくなくても JSON を作り直します。JSON は `shape_version`（`subscriber-milestones-publish.ts` の `SUBSCRIBER_MILESTONES_SHAPE_VERSION`）も持ち、ジェネット楽曲一覧と同じく、JSON の版がコードより古ければ作り直します。

`GET .../pending` が返すものは次のとおりです。`changed` のほかは、どれも「いま公開する」が JSON に書くものです。

| キー            | 中身                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `pending`       | 最新の版が前回の「いま公開する」より新しい節目                              |
| `changed`       | 公開中で、行が `publish` の版から変わった節目。先に「公開待ちにする」が要る |
| `eventChanged`  | つないだ出来事の姿が、保存済みの JSON と今のあしあとの JSON で違う節目      |
| `shapeOutdated` | 保存済みの JSON の形が、コードの版より古い                                  |

## 読むだけのエンドポイント

データの画面のいくつかは、保存するものを持ちません。別の場所で操作する行を選ぶか、他のエンドポイントが出さない記録を読むだけです。どれも `revision` を記録しません。

| メソッド | パス                                                    | 返すもの                                                                                                                                                   |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET      | `/admin/api/videos`                                     | `video` の行。`q`（`title` の部分文字列）・`channelId`・`limit`（既定 50、最大 100）で絞る。配信・動画の画面で上書きする 1 本を選ぶため                    |
| GET      | `/admin/api/snapshots`                                  | `channelId` の `channel_snapshot` の tick を `from`/`to`（日本時間の日付。どちらも既定は今日）の範囲で返し、その範囲の `channel_snapshot_exclusion` も返す |
| GET      | `/admin/api/collect-tasks`                              | `failed` のまま確認されていない `collect_task` の全行と、その数                                                                                            |
| POST     | `/admin/api/collect-tasks/<kind>/<対象 ID>/retry`       | `pending` に戻した後の行                                                                                                                                   |
| POST     | `/admin/api/collect-tasks/<kind>/<対象 ID>/ack`         | `checked_at` を記録した後の行。上の一覧から外れる                                                                                                          |
| POST     | `/admin/api/collect-tasks/<kind>/<対象 ID>/unavailable` | `video.availability` を `unavailable` に確定した後の行。チャンネルの失敗には使えず、400 を返す                                                             |
| GET      | `/admin/api/revisions`                                  | `revision` の行を新しい順に返す。`entity`・`action`・`from`/`to`（日本時間の日付）・`limit`（既定 50、最大 200）で絞る                                     |
| GET      | `/admin/api/revisions/<版 ID>`                          | `revision` の 1 行。`body` を含む                                                                                                                          |
| GET      | `/admin/api/publications`                               | `publication` の全行を新しい順に                                                                                                                           |
