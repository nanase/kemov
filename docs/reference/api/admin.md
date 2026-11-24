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

確かめで直せなかったずれは、`publication_write` の表（migration 0014）に残ります。JSON の書き込み 1 回ごとに 1 行です。

- R2 に書く前に行を足す。D1 に足せなければ書かない
- R2 が答えたら、届いたか失敗したかによらず `finished` を 1 にする
- 確かめが通ったら、その要求の行と、確かめで R2 を見る前に `finished` だった行を消す
  - まだ R2 に向かっている書き込みの行は残す。確かめの後に届くかもしれないため
  - `finished` にならないまま `ABANDONED_WRITE_MINUTES`（`worker/src/admin/publishing.ts`）より古くなった行も消す。要求が途中で終わったもの
- 行が残っている間は、公開の JSON が記録と食い違っているかもしれない。`GET .../pending` はこれを `behind: true` として返す

記録の `db.batch` が失敗したときは、記録済みの版だけから JSON を作り直してから、元の失敗を返します。作り直せなかったときは、`behind` が `true` のまま残ります。

公開の条件を満たさないときは、満たしていない条件をまとめて 400 で返します。本文は次のとおりです。

- `problems`: 欄の名前（`field`）と、編集の欄に出す文（`message`）の組の並び
- `errors`: `problems` の文だけの並び
- `saved`: 送った欄を保存したかどうか。要求ではなく、行のそれまでの状態で決まる
  - 下書きの行では `true`。欄は下書きのまま保存する
  - 公開中の行では `false`。行も公開の JSON も前の内容のまま残す。`POST .../publish` で送っても `PUT` で送っても同じ

条件は次のとおりです。

- `title` が空でない
- `videoId` が 11 文字
- `kind` が `debut` なら、`leadChannelIds` が 1 つ以上ある

出典が足りなくても、公開は断りません。公開の JSON の `source_pending` が `true` になり、年表に「出典の確認待ち」と出ます（[出典のホワイトリスト](#出典のホワイトリスト)）。

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

公開の処理のうち、書く順と失敗したときに残すものは `worker/src/admin/publishing.ts` の `publishChange` にあります。あしあとに固有の部分（欄、条件、版の中身、JSON の形）は `worker/src/admin/footprints-publish.ts` にあります。[登録者数の節目](#登録者数の節目)と[ジェネット楽曲一覧](#ジェネット楽曲一覧)も同じ形です（#283、#284）。

出来事の公開・公開中の保存・非公開に戻すの後には、節目の JSON も書き直します。節目の JSON が、つないだ出来事の題と日付を写すためです（[登録者数の節目](#登録者数の節目)）。

`leadChannelIds` は、`channelIds` のうち出来事の主役のメンバーです。`channelIds` に無い ID を含めると、保存の時点で 400 を返します。主役が無いデビューも、下書きとしては保存できます。

`GET .../pending` と `POST /admin/api/footprints/publish` は、公開の画面のために #285 まで残します。#281 より前の流れで公開待ちにした版は、`POST /admin/api/footprints/publish` か、次の公開・公開中の保存・非公開に戻すのどれかで公開の JSON に入ります。どれも、各できごとの最新の版から JSON を作るためです。`POST /admin/api/footprints/publish` も、書いた後に公開と同じ確かめを通ります。最新にできなかったときは、502 を返し、`publication` の行を足しません。公開待ちの版が無くても、`behind` か `outdated` が `true` なら記録から作り直します。

主役（`lead_channel_ids`）は、migration 0011 で足しました。それより前の `publish` の版は、このキーを持ちません。JSON を作るときと `GET .../pending` が比べるときは、この版を主役なし（`[]`）として読みます。

## 出典のホワイトリスト

あしあとの出典が足りるのは、ホワイトリストに載った出典が 1 つあるか、別々のホストの出典が 2 つあるときです。足りない出来事は、公開の JSON で `source_pending` が `true` になります（#282）。

判定は `src/admin/lib/source-check.ts` の `sourcesEnough` が行います。worker と管理サイトの画面が同じ関数を使うので、編集の欄の判定と公開の JSON は食い違いません。出来事の行は判定の結果を持ちません。

公開の JSON を書くたびに、JSON に載る出来事をすべて、そのときのホワイトリストで判定し直します。

- 版の `body` には、公開した時点の判定が残る
- #282 より前に手で付けた印も、次に JSON を書くときに判定に置き換わる
- `GET .../pending` の `changed` は、両側を今のホワイトリストで判定してから比べる。ホワイトリストを直しただけでは `changed` にならない

ホワイトリストに項目を追加・削除すると、本番の JSON の出来事が、今の版とホワイトリストから作る出来事と違うときだけ、公開の JSON を書き直します（`footprints-publish.ts` の `isOutdated`）。

- 公開待ちの版が残っていれば、ほかの公開と同じく、それも JSON に入る
- 書き直しだけが失敗しても、項目の追加・削除は取り消さない。応答の `timelineCurrent` が `false` になる
- 本番の JSON が古いときは、`GET /admin/api/footprints/pending` の `outdated` が `true` になり、「いま公開する」で書き直せる

ホワイトリストは、単独で出典として十分な URL の前方一致の一覧です。載っているのは、プロジェクト自身のドメインとアカウント、提携先の告知、イベントの主催者、ファンの wiki 2 つなどです。

- 一覧の実体は `source_whitelist` の表で、`migrations/0008_add_source_whitelist.sql` が作る（#175）
  - 初期値は、コードが以前定数として持っていた 13 件
- `worker/src/lib/source-whitelist.ts` の `readSourceWhitelist` が、公開の JSON を書くたびに一覧を読む
- 一覧との照合は `src/admin/lib/source-check.ts` の `isWhitelistedSource` が行う
  - 前方一致で、一致した後に続く文字も確かめる。`https://x.com/KEMOVP_staff_fake` は `https://x.com/KEMOVP_staff` に数えない
  - 一覧を引数で受け取り、何が数に入るかはその一覧だけで決まる

別々のホストの出典が 2 つあれば、どちらも載っていなくて構いません。同じホストの URL が 2 つ、たとえば YouTube の動画 2 本では、互いを繰り返しているだけなので足りません。

ホストは `new URL(url).hostname` から先頭の `www.` を除いたものです。`src/admin/lib/source-check.ts` の `HOST_ALIASES` が、次を同じホストとみなします。同じ場所を別の書き方で指すと分かっているホストだけを載せています。

- `twitter.com` は `x.com`
- `youtu.be` と `m.youtube.com` は `youtube.com`

1 つの投稿や 1 つのアカウントを指す 2 つの URL は、1 つの出典として数えます。この読み替えはホストを数えるときだけに使い、ホワイトリストとの照合は URL の文字列そのもので行います。

| メソッド | パス                                   | 返すもの                                                             |
| -------- | -------------------------------------- | -------------------------------------------------------------------- |
| GET      | `/admin/api/source-whitelist`          | すべての項目。足した順                                               |
| POST     | `/admin/api/source-whitelist`          | 足した後の項目と `timelineCurrent`。前方一致の文字列が既にあれば 409 |
| PUT      | `/admin/api/source-whitelist/<prefix>` | `note` を変えた後の項目。直せる列は `note` だけ                      |
| DELETE   | `/admin/api/source-whitelist/<prefix>` | `timelineCurrent`                                                    |

`<prefix>` は、URL をパーセントエンコードして 1 つのパスの区切りに収めたものです。

保存した時点で効き、`revision` は記録しません。一覧は出典の判定の設定で、公開するものではないためです。

項目を足したり取り除いたりすると、その場で公開の JSON を判定し直し、出来事の `source_pending` が変わるときは書き直します（[出典のホワイトリスト](#出典のホワイトリスト)）。出来事がその項目を使っていても、取り除く操作は拒みません。

## ジェネット楽曲一覧

| メソッド | パス                                          | 返すもの                                                                                     |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET      | `/admin/api/genet/people`                     | `genet_person` の全行                                                                        |
| POST     | `/admin/api/genet/people`                     | 作成した後の行                                                                               |
| GET      | `/admin/api/genet/people/<人物 ID>`           | 1 行                                                                                         |
| PUT      | `/admin/api/genet/people/<人物 ID>`           | 置き換えた後の行                                                                             |
| DELETE   | `/admin/api/genet/people/<人物 ID>`           | `{}`。まだその人をクレジットする曲があれば 409                                               |
| GET      | `/admin/api/genet/tunes`                      | `genet_tune` の全行と、それぞれの属性・動画・楽譜                                            |
| POST     | `/admin/api/genet/tunes`                      | 作成した後の行                                                                               |
| GET      | `/admin/api/genet/tunes/<曲 ID>`              | 1 行と、その属性・動画・楽譜。公開中の配信が演奏しているか（`live`）も返す                   |
| PUT      | `/admin/api/genet/tunes/<曲 ID>`              | 「この曲を保存」。置き換えた後の行と `live`。`live` なら JSON も書き直す                     |
| DELETE   | `/admin/api/genet/tunes/<曲 ID>`              | `{}`。まだその曲を演奏する配信があれば 409                                                   |
| GET      | `/admin/api/genet/streams`                    | `genet_stream` の全行と、それぞれの演奏とシーン                                              |
| POST     | `/admin/api/genet/streams`                    | `draft` で作成した後の行                                                                     |
| GET      | `/admin/api/genet/streams/<動画 ID>`          | 1 行と、その演奏とシーン                                                                     |
| PUT      | `/admin/api/genet/streams/<動画 ID>`          | 「保存」。下書きなら保存した後の行。公開中なら、保存して JSON を書き直した後の行             |
| DELETE   | `/admin/api/genet/streams/<動画 ID>`          | `{}`。`published` の配信なら 409                                                             |
| POST     | `/admin/api/genet/streams/<動画 ID>/publish`  | 「公開」。保存し、検証し、JSON を書き直した後の行                                            |
| POST     | `/admin/api/genet/streams/<動画 ID>/withdraw` | 「非公開に戻す」。JSON から外し、`draft` として保存した後の行。`published` でなければ 409    |
| GET      | `/admin/api/genet/pending`                    | 公開の JSON がまだ写していない版と、公開中なのに公開の JSON と違う配信・曲・人物             |
| POST     | `/admin/api/genet/publish`                    | 公開の JSON がまだ写していない版から JSON を作り直したかどうかと、配信・曲・人物それぞれの数 |

`GET /admin/api/genet/tunes` は `q`（`title` の部分文字列）で絞ります。`GET /admin/api/genet/streams` は、あしあとの一覧と同じく `status`（`draft` か `published`）と `q`（`title` の部分文字列）で絞ります。

配信の状態は、あしあとと同じく下書き（`draft`）と公開中（`published`）の 2 つです（#277、#284）。「あとで」（`status = 'review'`）はなくしました。`review` だった配信は、migration 0016 で `draft` に移しました。表の CHECK は `review` を許したままですが、コードはもう書きません。

下書きの保存・公開・公開中の保存・非公開に戻すの 4 つの操作は、[あしあと](#あしあと)と同じ形です。どれも配信のすべての欄を本文に送ります。公開・公開中の保存・非公開に戻すは、1 回の要求で公開の JSON（`genet/music.json`）まで書き直します。書く順、記録した後の確かめ、`publication_write` の扱い、断ったときと書けなかったときの答えも、あしあとと同じです。公開の処理は `worker/src/admin/publishing.ts` の `publishChange` を通り、楽曲一覧に固有の部分は `worker/src/admin/genet-publish.ts` にあります。

公開の JSON は、配信・曲・人物の 3 つの版から作ります。そのため `publishing.ts` には、配信の操作なら曲と人物を、曲の保存なら配信と人物を `alsoBuiltFrom` として渡します。3 つは 1 つの `publication` の行（`target = 'genet_music'`）を共有します。

`genet_tune` と `genet_person` は、自分の `status` を持ちません。#141 の設計では、公開の門を持つのは `genet_stream` だけだからです。曲と人物が公開の JSON に載るのは、公開中の配信が演奏しているときです。

- 配信の公開と公開中の保存では、演奏するすべての曲と、その曲がクレジットするすべての人物を、配信と一緒に検証する
  - 自分の最新の版と一致しない曲・人物には、`publish` の版を配信の版と同じ `db.batch` で記録する
- 非公開に戻すでは、配信の `withdraw` の版だけを記録する
  - 曲と人物の版はそのまま残る。ほかの公開中の配信が演奏していなければ、配信と一緒に JSON から外れる
- 公開中の配信が演奏していない曲の保存は、行を保存するだけで、版を記録しない
- 公開中の配信が演奏している曲の保存は、公開中の配信の保存と同じく、1 回の要求で JSON まで書き直す（#277 の 6-5）
  - 曲の `publish` の版と、自分の最新の版と一致しない人物の `publish` の版を記録する
  - 条件を満たさなければ 400 を返し、何も保存しない。本文は配信と同じく `problems`・`errors`・`saved` を持ち、`saved` は `false`。`problems` の `field` は `attributes` で、`attributeIndex` が何番目の属性かを 0 から数える
  - JSON を書けなかったときは、欄だけを保存し、502 と `saved: true` を返す
- 人物の保存は、行を保存するだけで、版を記録しない。次にその人物をクレジットする曲が公開中の配信と一緒に保存されたときに、JSON へ届く

配信の公開と公開中の保存は、満たしていない条件をまとめて 400 で返します。本文はあしあとと同じく `problems`・`errors`・`saved` を持ちます。`problems` の `field` は `title`・`videoId`・`performances` のどれかで、演奏についての条件には何曲目かを 0 から数えた `performanceIndex` が付きます。条件は次のとおりです。

- `title` が空でない
- `youtube` の配信なら、`videoId` と、各シーンの動画 ID が 11 文字
- 演奏が 1 つ以上ある
- 曲の属性が、`text` とクレジットする人物の両方を持っていない
  - 曲は配信をまたいで共有するので、同じ曲の条件は最初の演奏にだけ付ける

保存で既に断る条件は、ここでもう一度は見ません。`publishedAt` の形、シーンの開始秒、存在しない曲・人物を指す演奏とクレジット、曲の空の題、人物の空の名前です。

`GET .../pending` と `POST /admin/api/genet/publish` は、公開の画面のために #285 まで残します。#284 より前の流れで公開待ちにした版は、`POST /admin/api/genet/publish` か、次の配信の操作・公開中の配信が演奏する曲の保存のどれかで公開の JSON に入ります。どれも、配信・曲・人物それぞれの最新の版から JSON を作るためです。`GET .../pending` が返すものは次のとおりです。

| キー            | 中身                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `pending`       | 最新の版が、前回 JSON を書いたときより新しい配信・曲・人物。#284 より前に「公開待ちにする」を押した配信など     |
| `changed`       | 行が最新の `publish` の版から変わったもの。配信は公開中のものだけを、曲と人物は一度でも版を記録したものを比べる |
| `shapeOutdated` | 保存済みの JSON の形が、コードの版より古い                                                                      |
| `behind`        | 公開の JSON が記録と食い違っているかもしれない。あしあとの `behind` と同じ                                      |

`POST /admin/api/genet/publish` は、`pending`・`shapeOutdated`・`behind` のどれかがあるときだけ、最新の操作が `withdraw` でない配信それぞれの最新の `revision` から `genet/music.json` を作ります。曲と人物は、それらの配信の公開済みの本文が名指ししているものを含めます。作業中の表を読み直すのではありません。そのため、公開した後に配信から外した曲が、JSON に戻ってくることはありません。書いた後に公開と同じ確かめを通ります。最新にできなかったときは、502 を返し、`publication` の行を足しません。

JSON は `shape_version` と `channel_id` も持ちます。

- `shape_version` は、`genet-publish.ts` の `GENET_MUSIC_SHAPE_VERSION`
  - 公開の操作は、`publication` の行ではなく、保存済みの JSON そのものから版を読む
  - JSON の版がコードの版より古ければ、新しい版の履歴が無くても作り直す。`shape_version` の無い JSON は版 1 とみなす
  - JSON の形を変えたら、この定数を上げる。次の「いま公開する」で、公開の JSON に変更が届く
- `channel_id` は、ページが題の横にアイコンを描くチャンネル
  - `video` にある公開済みの YouTube の配信のうち、半数以上が属し、他のどのチャンネルよりも多いチャンネルを選ぶ
  - そうしたチャンネルが無ければ `null` で、ページは色の付いた丸のままになる

## 登録者数の節目

| メソッド | パス                                                   | 返すもの                                                                                  |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| GET      | `/admin/api/subscribers/milestones`                    | `subscriber_milestone` の全行と、それぞれの出典。達成の日の古い順                         |
| GET      | `/admin/api/subscribers/milestones/<節目 ID>`          | 1 行と、その出典                                                                          |
| POST     | `/admin/api/subscribers/milestones`                    | `draft` で作成した後の行                                                                  |
| PUT      | `/admin/api/subscribers/milestones/<節目 ID>`          | 「保存」。下書きなら保存した後の行。公開中なら、保存して JSON を書き直した後の行          |
| DELETE   | `/admin/api/subscribers/milestones/<節目 ID>`          | `{}`。消す時点で `published` の節目なら 409                                               |
| POST     | `/admin/api/subscribers/milestones/<節目 ID>/publish`  | 「公開」。保存し、検証し、JSON を書き直した後の行                                         |
| POST     | `/admin/api/subscribers/milestones/<節目 ID>/withdraw` | 「非公開に戻す」。JSON から外し、`draft` として保存した後の行。`published` でなければ 409 |
| POST     | `/admin/api/subscribers/source-check`                  | 送った出典それぞれの扱いと、出典が足りているか。何も保存しない                            |
| GET      | `/admin/api/subscribers/pending`                       | 公開の JSON がまだ写していない版と、公開中なのに公開の JSON と違う節目                    |
| POST     | `/admin/api/subscribers/publish`                       | 公開の JSON がまだ写していない版から JSON を作り直したかどうかと、作り直したなら節目の数  |

`GET /admin/api/subscribers/milestones` は、クエリパラメーターの `channelId` と `status`（`draft` か `published`）で一覧を絞ります。

節目の状態は、あしあとと同じく下書き（`draft`）と公開中（`published`）の 2 つです（#277、#283）。「確認中」（`status = 'review'`）はなくしました。`review` だった節目は、migration 0015 で移しました。最新の版が `publish` の節目は、公開の JSON に載っているかもしれないので `published` に、それ以外は `draft` にしました。表の CHECK は `review` を許したままですが、コードはもう書きません。

下書きの保存・公開・公開中の保存・非公開に戻すの 4 つの操作は、[あしあと](#あしあと)と同じ形です。どれもすべての欄を本文に送ります。公開・公開中の保存・非公開に戻すは、1 回の要求で公開の JSON（`subscribers/milestones.json`）まで書き直します。書く順、記録した後の確かめ、`publication_write` の扱い、断ったときと書けなかったときの答えも、あしあとと同じです。公開の処理は `worker/src/admin/publishing.ts` の `publishChange` を通り、節目に固有の部分は `worker/src/admin/subscriber-milestones-publish.ts` にあります。

保存するときは、次を確かめます。満たさなければ 400 を返し、何も保存しません。

- `channelId` の行が `channel` にある
- `reachedDate` が `datePrecision` の形（`YYYY-MM-DD` か `YYYY-MM`）に合っている
- `subscriberCount` が 1 以上の整数
- `announcedBy` が `member`・`official`・`listener` のどれか
- `eventId` をつなぐなら、その出来事があり、その `kind` が `milestone`
- 出典の `url` が、ホストを持つ `https://` の URL で、ユーザー名とパスワードを含まない

下書きの保存は、読んだときに下書きだった行にだけ書きます。読んでから書くまでの間にほかのタブなどで公開されていたら、409 を返し、何も書きません。版を記録しない書き込みで公開中の行を上書きしないためです。公開で断られた下書きの欄を保存するときも同じです。

ほかの操作とぶつかったときも、読んだときの状態のままの行にだけ書きます。合わなければ 409 を返し、行も版も書きません。

- 公開中の保存は、まだ公開中の行にだけ書きます。間に非公開に戻されていたら、先に書いた JSON を版から作り直し、節目を本番に戻しません
- 下書きの公開は、まだ下書きで、読んでから節目の版が増えていない行にだけ書きます。間にほかの要求が公開していたら、その公開を残します
- 非公開に戻すは、まだ公開中で、読んでから節目の版が増えていない行にだけ書きます。間にほかの要求が非公開に戻した、または保存したときは、その内容を残し、2 つ目の `withdraw` の版も記録しません
- この 3 つで JSON を作り直せなかったときは、409 ではなく 502 を返します。`saved` は `false` です。`behind` が残るので、公開の画面の「いま公開する」で直ります
- JSON を書けずに欄だけを保存するときは、読んでから節目の版が増えていない行にだけ書きます。間にほかの要求が記録した公開を、遅れて着いた保存で上書きしないためです
- 削除は、消す時点でまだ下書きの行だけを消します。間に公開されていたら、行も出典も残します

「非公開に戻す」では、行がもうつないでいる出来事は、その `kind` が `milestone` でなくなっていても、そのまま残せます。あしあとの側で出来事の種類を変えても、節目を本番から外せなくならないようにするためです。新しくつなぐ出来事は、ほかの操作と同じく確かめます。

公開の条件は、出典が足りていることだけです。あしあとと違い、足りなければ公開しません（#277 の 6-7）。断るときの 400 の本文は、あしあとと同じく `problems`・`errors`・`saved` を持ちます。`problems` の `field` は `sources` です。

出典が足りる条件は次のとおりです。

- 出典が 1 つ以上ある
- 数えるのは、保存で通る URL だけ（上の出典の `url` の条件）
- `announcedBy` が `listener` なら、そのリスナーの投稿 1 つで足りる
- `announcedBy` が `member` か `official` なら、あしあとと同じ条件（[出典のホワイトリスト](#出典のホワイトリスト)）に次を足したもので足りる
  - 節目のメンバー本人のチャンネルの動画の URL 1 つは、ホワイトリストの出典と同じに数えます。メンバーが配信の画面に登録者数を映したときの、その配信です
    - 動画の URL として読むのは、`https://www.youtube.com/watch?v=<ID>`（`youtube.com`・`m.youtube.com` も同じ。`t=` などのクエリが付いていても構いません）、`https://youtu.be/<ID>`、`https://www.youtube.com/live/<ID>` です。`worker/src/lib/source-whitelist.ts` の `youtubeVideoIdOf` が ID を取り出します
    - チャンネルのページ、再生リスト、`youtube.com` 以外のホストは、動画の URL ではありません
    - `<ID>` が `video` の表にあり、その `channel_id` が節目の `channel_id` と一致することが必要です。他のメンバーの動画や、`video` の表に無い動画では通りません。収集の対象より古い動画は、表に無いので通りません（#230）

`POST /admin/api/subscribers/source-check` は、この判定を保存せずに返します。編集の欄が、出典を打つたびに呼びます（#277 の 2a）。答えは目安です。公開は、画面の答えを使わず、同じ関数（`judgeSources`）でもう一度判定します。問い合わせから公開までの間にホワイトリストや動画の表が変わると、答えが変わることがあります。

- 本文は `{ channelId, announcedBy, urls }`。`urls` は文字列の配列で、50 件まで
- 答えは `{ marks, enough }`
  - `enough` は、出典が足りているか
  - `marks` は、`urls` と同じ順に並べたそれぞれの扱い

| `marks` の `kind` | 意味                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whitelist`       | ホワイトリストに載っている                                                                                                                                                                                                             |
| `own_video`       | 節目のメンバー本人のチャンネルの動画                                                                                                                                                                                                   |
| `host`            | どちらでもない。`host` は数え方をそろえたホスト名で、`www.` を外し、`youtu.be` を `youtube.com` として読む。URL として読めなければ `null`。`sameSite` は、前の出典に同じホストがあれば `true`。保存で通らない URL は前の出典に数えない |

節目につながった出来事は、`DELETE /admin/api/footprints/events/<できごと ID>` で消せません。409 を返します。先に節目の側でつなぎを外します。

公開の JSON は、あしあとの JSON とは別のファイルです。統計やメンバーのページが、あしあと全体を読まずに済むようにするためです。中身は、`publish` の版の中身と次の 2 点が違います。

- `announced_by` が `listener` の節目は、`sources` を空にする
  - リスナーの投稿の URL は、版と管理サイトにだけ残す
- `event_id` の代わりに `event` を持つ
  - `event` は `{ event_id, title, start_date }` で、年表に出ている出来事の姿を写す。あしあとの最新の `publication` が指す版までのうち、出来事ごとに最も新しい版から写す
  - 記録はされたが年表にまだ出ていない版は、まだ写さない。年表を最新にできなかった公開や、#281 より前に公開待ちにした版が当たる
    - 節目の JSON が、年表に無い出来事を指さないため
  - その版が `withdraw` か、版が無ければ `null`

公開の JSON は、節目の版のほかに出来事の版からも作ります。そのため `publishing.ts` には `alsoBuiltFrom: ['footprints_event']` として渡し、記録した後の確かめでも出来事の版を見ます。節目を公開している間に出来事の版が記録されたら、JSON を作り直します。

出来事は、あしあとの最新の `publication` が指す版までを写します。あしあとの「いま公開する」は、版を足さずにこの位置を進めます。そのため `publishing.ts` には、この位置を `cutoff` として渡します。記録した後の確かめで、位置が JSON を作ったときと違えば、JSON を作り直します。出来事の公開が続いている間は、作り直しの上限（`REBUILD_LIMIT`）に達して 502 になることがあります。そのときは記録は済んでいて、`behind` が残ります。

あしあとで出来事を公開・公開中の保存・非公開に戻すと、その後に節目の JSON も書き直します（#277 の 6-6、`republishMilestonesForEvents`）。

- 書き直すのは、保存済みの JSON の `event` が、今の出来事の版から作るものと違うときだけ
- 書き直せなくても、出来事の操作は通ったまま答える。節目は `GET .../pending` の `eventChanged` に残り、公開の画面の「いま公開する」で直る
- あしあとの `POST /admin/api/footprints/publish` の後も同じ

JSON は `shape_version`（`subscriber-milestones-publish.ts` の `SUBSCRIBER_MILESTONES_SHAPE_VERSION`）も持ちます。ジェネット楽曲一覧と同じく、JSON の版がコードより古ければ作り直します。

`GET .../pending` と `POST /admin/api/subscribers/publish` は、公開の画面のために #285 まで残します。`GET .../pending` が返すものは次のとおりです。`changed` のほかは、どれも「いま公開する」が JSON に書くものです。

| キー            | 中身                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `pending`       | 最新の版が、前回 JSON を書いたときより新しい節目。#283 より前に「公開待ちにする」を押した節目など      |
| `changed`       | 公開中で、行が `publish` の版から変わった節目。JSON を書けなかった公開中の保存の後に出る               |
| `eventChanged`  | つないだ出来事の姿が、保存済みの JSON と今の出来事の版で違う節目。出来事の操作の後の書き直しが失敗した |
| `shapeOutdated` | 保存済みの JSON の形が、コードの版より古い                                                             |
| `behind`        | 公開の JSON が記録と食い違っているかもしれない。あしあとの `behind` と同じ                             |

`POST /admin/api/subscribers/publish` は、上のどれか（`changed` を除く）があるときだけ、各節目の最新の版から JSON を作り直します。書いた後に公開と同じ確かめを通ります。最新にできなかったときは、502 を返し、`publication` の行を足しません。

## やること

確認待ち・出典の確認待ち・公開待ちの 3 つの画面は、上のデータの絞り込みです。自分の表は持ちません（#141）。`worker/src/admin/inbox.ts` が行を選び、1 段だけ動かします。行の中身と公開の仕方は、上の各エンドポイントが受け持ちます。

| メソッド | パス                       | 返すもの                                                                                                                      |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET      | `/admin/api/inbox`         | 確認待ち・出典の確認待ち・公開待ちそれぞれの行の数。サイドバーに出す。出典を判定できないときは、出典の確認待ちの数だけ `null` |
| GET      | `/admin/api/inbox/review`  | 確認待ちの出来事と配信。配信が演奏する曲の題も返す                                                                            |
| GET      | `/admin/api/inbox/source`  | 出典が足りない出来事のすべて。`status` を問わない                                                                             |
| GET      | `/admin/api/inbox/publish` | 次の「いま公開する」が扱うものを、公開の JSON ごとに題と日付を付けて返す。押して何か起きるかも返す                            |

確認待ちに並ぶのは、`status` が `draft` で、`import` か `publish` の版が無い行です。公開してから取り下げた行は入りません。

「あとで」は、あしあとでは #281 で、楽曲一覧では #284 でなくしました。`status` が `review` だった出来事と配信は、migration 0013 と 0016 で `draft` に移しました。

承認は各行の `POST .../publish`、却下は各行の `DELETE` を使います。ここに専用のエンドポイントはありません。承認は、行の欄を本文に送ります。

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
