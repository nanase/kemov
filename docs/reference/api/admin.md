# 管理サイトの API

`/admin/api` のエンドポイントです。Cloudflare Access の後ろにあり、worker も要求ごとに Access の署名を検証し、そのメールアドレスが `ADMIN_EMAILS` にあるかを確かめます（[管理サイト](../admin.md#admin-と-cloudflare-access)）。

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

例外は、メンバーの一覧を扱う `POST /admin/api/members` と `PUT /admin/api/members` です。この 2 つは、足した行と順番が変わった行ごとに `revision` に 1 行を、同じ `db.batch` で記録します。順番が変わらない行には何も記録しません。`revisionId` は返さず、POST は 201 で足した行を `member` に、PUT は保存した後の一覧を `members` に入れて返します。`PUT /admin/api/members` が `add` の 1 人の値を断る 400 では、その人の `channelId` が文字列のとき、本文に `error` と並べて入れます。文字列でなければ `error` だけです。画面は、`channelId` でどの行の誤りかを知ります。

PUT は、列を 1 つずつ直すのではなく、すべての列をまとめて置き換えます。

- そのエンドポイントが扱わない列を送ると、400 で拒む
- 本文に無い列は null として扱い、null にできない列なら 400 で拒む

保存のたびの `revision.body` は、`worker/src/lib/revision.ts` を通して作ります。中身は保存した行から、保存の時刻だけを表す列を除いたものです。JSON のキーは、行の列の順に並びます。

メンバーの版は、さらに `custom_url` と `thumbnail_url` も除きます。どちらも YouTube API から取った値で、持ってよいのは 30 日までです（[#222](https://github.com/nanase/kemov/issues/222)）。`revision` は追記だけで行を消せないので、はじめから写しません。この 2 列はメンバーの保存では変わらないので、版から読み取れることは減りません（[#224](https://github.com/nanase/kemov/issues/224)）。

## あしあと

| メソッド | パス                                                  | 返すもの                                                                                     |
| -------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET      | `/admin/api/footprints/events`                        | `footprints_event` の全行と、それぞれのメンバーと出典                                        |
| GET      | `/admin/api/footprints/events/<できごと ID>`          | 1 行と、そのメンバーと出典                                                                   |
| POST     | `/admin/api/footprints/events`                        | `draft` で作成した後の行                                                                     |
| PUT      | `/admin/api/footprints/events/<できごと ID>`          | 「保存」。下書きなら保存した後の行。公開中なら、保存して JSON を書き直した後の行             |
| DELETE   | `/admin/api/footprints/events/<できごと ID>`          | `{}`。`published` のできごとなら 409                                                         |
| POST     | `/admin/api/footprints/events/<できごと ID>/publish`  | 「公開」。保存し、検証し、JSON を書き直した後の行                                            |
| POST     | `/admin/api/footprints/events/<できごと ID>/withdraw` | 「非公開に戻す」。JSON から外し、`draft` として保存した後の行。`published` でなければ 409    |
| GET      | `/admin/api/footprints/pending`                       | 公開の JSON がまだ写していない版と、公開中なのに公開の JSON と違うできごと                   |
| POST     | `/admin/api/footprints/publish`                       | 公開の JSON がまだ写していない版から JSON を作り直したかどうかと、作り直したならできごとの数 |

`GET /admin/api/footprints/events` は、クエリパラメーターの `status`（`draft` か `published`）と `q`（`title` の部分文字列）で一覧を絞ります。

できごとの状態は、下書き（`draft`）と公開中（`published`）の 2 つです（#277、#281）。公開待ちはありません。公開・公開中の保存・非公開に戻すは、どれも 1 回の要求で公開の JSON（`footprints/events.json`）まで書き直します。

| 操作         | 要求                | 本文       | 通ったとき                                                         |
| ------------ | ------------------- | ---------- | ------------------------------------------------------------------ |
| 下書きの保存 | `PUT`（下書きの行） | すべての欄 | 欄を保存する。`revision` は記録しない                              |
| 公開         | `POST .../publish`  | すべての欄 | 欄を保存し、`status` を `published` にし、`publish` の版を記録する |
| 公開中の保存 | `PUT`（公開中の行） | すべての欄 | 欄を保存し、`publish` の版を記録する                               |
| 非公開に戻す | `POST .../withdraw` | すべての欄 | 欄を保存し、`status` を `draft` にし、`withdraw` の版を記録する    |

公開・公開中の保存・非公開に戻すは、まず公開の JSON を作って `PUBLIC_DATA` に書きます。書けたときだけ、欄・`status`・`revision` を 1 回の `db.batch` で記録します。公開の JSON は、今までどおり各できごとの最新の版から作ります。

記録した後に、公開の JSON をもう一度確かめます。2 つの要求が重なると、どちらも相手の版を記録する前に JSON を作るため、後から書いた方が先の変更を落とすためです。

- JSON を作った後に記録された版があるか、ほかの要求が JSON を書き直していたら、記録済みの版だけから作り直して書く
  - ほかの要求が書き直したかどうかは、R2 のオブジェクトの `version` で見分ける
  - 作り直しは `REBUILD_LIMIT`（`worker/src/admin/publishing.ts`）の回数まで
- 確かめが通ったら、`publication` の行を 1 つ足す。`last_revision_id` は、JSON が持つ最新の版
  - もっと新しい版を指す行がほかの要求で先に入っていたら、足さない。最新の行が古い版に戻ると、公開済みの版が公開待ちに見えるため

公開の条件を満たさないときは、満たしていない条件をまとめて 400 で返します。本文は次のとおりです。

- `problems`: 欄の名前（`field`）と、編集の欄に出す文（`message`）の組の並び
- `errors`: `problems` の文だけの並び
- `saved`: 送った欄を保存したかどうか
  - 公開では `true`。欄は下書きのまま保存する
  - 公開中の保存では `false`。行も公開の JSON も前の内容のまま残す

条件は次のとおりです。

- `title` が空でない
- `sourcePending: false` なら、数に入る出典がある（[出典のホワイトリスト](#出典のホワイトリスト)）
- `videoId` が 11 文字
- `kind` が `debut` なら、`leadChannelIds` が 1 つ以上ある

公開の JSON を書けなかったときは、502 を返します。

- 公開と公開中の保存では、欄だけを保存し、`saved: true` と保存した後の行を返す
  - 下書きは下書きのまま、公開中の行は前の版のまま残る
  - 公開中の行は、次の「保存」まで公開の JSON と食い違う。`GET .../pending` はこれを `changed` として返す
- 非公開に戻すでは、何も変えない

記録した後に JSON を最新にできなかったときも、502 と `saved: true` と保存した後の行を返します。作り直しが上限に達したときと、作り直した JSON を書けなかったときです。

- 記録はもう済んでいる。公開と公開中の保存なら行は公開中、非公開に戻すなら行は下書きになっている
- 公開の JSON にその変更が出ているかは分からない
- `publication` の行は足さない。そのため、次に `publication` の行が足されるまで、`GET .../pending` はその版を公開待ちとして返す
- 次にどれかの行を公開・公開中の保存・非公開に戻すと、JSON は記録済みの版から作り直される

公開の処理のうち、書く順と失敗したときに残すものは `worker/src/admin/publishing.ts` の `publishChange` にあります。あしあとに固有の部分（欄、条件、版の中身、JSON の形）は `worker/src/admin/footprints-publish.ts` にあります。登録者数の節目とジェネット楽曲一覧も、同じ形に移す予定です（#283、#284）。

`leadChannelIds` は、`channelIds` のうち出来事の主役のメンバーです。`channelIds` に無い ID を含めると、保存の時点で 400 を返します。主役が無いデビューも、下書きとしては保存できます。

`GET .../pending` と `POST /admin/api/footprints/publish` は、公開の画面のために #285 まで残します。#281 より前の流れで公開待ちにした版は、`POST /admin/api/footprints/publish` か、次の公開・公開中の保存・非公開に戻すのどれかで公開の JSON に入ります。どれも、各できごとの最新の版から JSON を作るためです。`POST /admin/api/footprints/publish` も、書いた後に公開と同じ確かめを通ります。最新にできなかったときは、502 を返し、`publication` の行を足しません。

主役（`lead_channel_ids`）は、migration 0011 で足しました。それより前の `publish` の版は、このキーを持ちません。JSON を作るときと `GET .../pending` が比べるときは、この版を主役なし（`[]`）として読みます。

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
- 出典の `url` が、ホストを持つ `https://` の URL で、ユーザー名とパスワードを含まない

`POST .../publish` は、満たしていない条件をまとめて 400 で返します。条件は次のとおりです。

- 出典が 1 つ以上ある
- `announcedBy` が `member` か `official` なら、出典が足りている
  - 足りる条件は、あしあとと同じ（[出典のホワイトリスト](#出典のホワイトリスト)）に、次を足したものです
  - 節目のメンバー本人のチャンネルの動画の URL 1 つは、ホワイトリストの出典と同じに数えます。メンバーが配信の画面に登録者数を映したときの、その配信です
    - 動画の URL として読むのは、`https://www.youtube.com/watch?v=<ID>`（`youtube.com`・`m.youtube.com` も同じ。`t=` などのクエリが付いていても構いません）、`https://youtu.be/<ID>`、`https://www.youtube.com/live/<ID>` です。`worker/src/lib/source-whitelist.ts` の `youtubeVideoIdOf` が ID を取り出します
    - チャンネルのページ、再生リスト、`youtube.com` 以外のホストは、動画の URL ではありません
    - `<ID>` が `video` の表にあり、その `channel_id` が節目の `channel_id` と一致することが必要です。他のメンバーの動画や、`video` の表に無い動画では通りません。収集の対象より古い動画は、表に無いので通りません（#230）
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

## やること

確認待ち・出典の確認待ち・公開待ちの 3 つの画面は、上のデータの絞り込みです。自分の表は持ちません（#141）。`worker/src/admin/inbox.ts` が行を選び、1 段だけ動かします。行の中身と公開の仕方は、上の各エンドポイントが受け持ちます。

| メソッド | パス                                                        | 返すもの                                                                                           |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET      | `/admin/api/inbox`                                          | 確認待ち・出典の確認待ち・公開待ちそれぞれの行の数。サイドバーに出す                               |
| GET      | `/admin/api/inbox/review`                                   | 確認待ちの出来事と配信。配信が演奏する曲の題も返す                                                 |
| GET      | `/admin/api/inbox/source`                                   | `sourcePending` が true の出来事のすべて。`status` を問わない                                      |
| GET      | `/admin/api/inbox/publish`                                  | 次の「いま公開する」が扱うものを、公開の JSON ごとに題と日付を付けて返す。押して何か起きるかも返す |
| POST     | `/admin/api/footprints/events/<できごと ID>/confirm-source` | `sourcePending` を false にした後の行。出典が公開の条件を満たさなければ 400                        |
| POST     | `/admin/api/genet/streams/<動画 ID>/defer`                  | `{ "status": "review" }`。`published` の配信なら 409                                               |

確認待ちに並ぶのは、次の行です。

- `status` が `draft` で、`import` か `publish` の版が無い行。公開してから取り下げた行は入りません
- `status` が `review` の配信。「あとで」に回した配信で、まだ見ていない行の後ろに並べます

あしあとの「あとで」は #281 でなくしました。`status` が `review` だった出来事は、migration 0013 で `draft` に移しました。表の CHECK は `review` を許したままですが、コードはもう書きません。

承認は各行の `POST .../publish`、却下は各行の `DELETE` を使います。ここに専用のエンドポイントはありません。あしあとの承認は、行の欄を本文に送ります。

`defer` と `confirm-source` は、保存と同じく `revision` を記録しません。そのため、公開中の出来事の出典を確かめても、公開の JSON はそのままです。あしあとで「保存」を押すと反映されます。

公開待ちの登録者数の節目には、`eventChanged` の節目も入ります。`latestAction` は `event_changed` です。

## 読むだけのエンドポイント

データの画面のいくつかは、保存するものを持ちません。別の場所で操作する行を選ぶか、他のエンドポイントが出さない記録を読むか、YouTube に問い合わせるだけです。どれも `revision` を記録しません。

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
| GET      | `/admin/api/channel-lookup/<チャンネル ID>`             | YouTube の Channels.list（`part=snippet`）が返したチャンネル名とアイコン。メンバーを足す前の確認用                                                         |

### メンバーを足す前のチャンネルの確認

`GET /admin/api/channel-lookup/<チャンネル ID>` は、メンバー画面の「＋ メンバーを足す」で、channel_id が正しいかを確かめるために呼びます（#276）。実装は `worker/src/admin/channel-lookup.ts` です。

200 の本文は `channelId`・`title`・`iconDataUrl` です。アイコンは、worker が `yt3.ggpht.com` か `yt3.googleusercontent.com` から取り、`data:` URL にして本文に載せます。管理サイトの CSP が `img-src 'self' data:` で、YouTube の画像の URL を直接は読めないためです。チャンネルはあるのに画像だけ取れなかったときは、200 のまま `iconDataUrl` を `null` にします。

| 状態           | HTTP | 意味                                                                                                                                                          |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 見つかった     | 200  | チャンネル名とアイコンを返します                                                                                                                              |
| 形が違う       | 400  | `UC` から始まる 24 文字でない ID です。YouTube には問い合わせません                                                                                           |
| 見つからない   | 404  | Channels.list が、そのチャンネルを返しませんでした。YouTube 自身が 404 の `channelNotFound` を返したときも同じです。本文の `code` は `channel_not_found` です |
| 確かめられない | 502  | YouTube への問い合わせが失敗しました。ID が正しいかどうかは分かりません                                                                                       |

画面は、`code` が `channel_not_found` の 404 だけを「見つからない」として「一覧に足す」を止めます。`code` の無い 404 を含め、ほかの失敗は「確かめられない」として、足すことは止めません。

返した値は D1 にも R2 にも残しません。YouTube API の値は、このサイトで 30 日までしか持てないためです（[30 日を過ぎたデータの削除](../data.md#30-日を過ぎたデータの削除)）。
