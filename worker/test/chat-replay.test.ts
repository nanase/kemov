import { env } from 'cloudflare:test';

import { runChatReplay } from '../src/collector/chat-replay';

interface TaskRow {
  target_id: string;
  state: string;
  attempts: number;
  cursor: string | null;
  next_attempt_at: string | null;
}

interface VideoRow {
  video_id: string;
  chat_message_count: number | null;
  chat_unique_user_count: number | null;
}

// A minute the job is allowed to scan on, and one it is not. Pinned rather
// than taken from the clock because which of the two it is decides whether a
// tick looks for new work at all.
const SCANNING_MINUTE = new Date('2026-01-01T00:10:00Z');
const QUIET_MINUTE = new Date('2026-01-01T00:11:00Z');

/**
 * Every column `video` requires, so a test can say what it means: a stream
 * that ended and has no chat count yet. #63 owns the real writer.
 */
async function insertVideo(videoId: string, endedAt: string | null = '2026-01-01T00:00:00Z'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        actual_end_time, fetched_at)
     VALUES (?1, 'UCtest', ?1, '2026-01-01T00:00:00Z', 'public', 'none', ?2, '2026-01-01T00:00:00Z')`,
  )
    .bind(videoId, endedAt)
    .run();
}

/** `video` has a foreign key to `channel`, so one row has to exist first. */
async function insertChannel(): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back,
                                    activity_start_date)
     VALUES ('UCtest', 'UCtest', 'UCtest', '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  ).run();
}

async function allTasks(): Promise<TaskRow[]> {
  return (
    await env.DB.prepare(
      `SELECT target_id, state, attempts, cursor, next_attempt_at FROM collect_task
        WHERE kind = 'chat_replay' ORDER BY target_id`,
    ).all<TaskRow>()
  ).results;
}

async function allVideos(): Promise<VideoRow[]> {
  return (
    await env.DB.prepare(
      'SELECT video_id, chat_message_count, chat_unique_user_count FROM video ORDER BY video_id',
    ).all<VideoRow>()
  ).results;
}

async function authorCount(videoId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM chat_author WHERE video_id = ?1')
    .bind(videoId)
    .first<{ n: number }>();

  return row?.n ?? 0;
}

/** Queues one video directly, as a tick that had already scanned would have. */
async function queue(videoId: string, cursor: string | null = null, attempts = 0): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO collect_task (kind, target_id, state, attempts, cursor, next_attempt_at, updated_at)
     VALUES ('chat_replay', ?1, 'pending', ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  )
    .bind(videoId, attempts, cursor)
    .run();
}

/** A watch page carrying what the replay call needs, or missing a piece of it. */
function watchPage({ playability = 'OK', conversationBar = true } = {}): Response {
  const body = [
    `{"playabilityStatus":{"status":"${playability}"},`,
    '"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"9.9",',
    conversationBar
      ? '"conversationBar":{"liveChatRenderer":{"continuations":[{"reloadContinuationData":{"continuation":"page-1"}}]}},'
      : '',
    '"trackingParams":"unused"}',
  ].join('');

  return new Response(body, { status: 200 });
}

/** One replay page. Author ids are invented; a real one's never leaves the run. */
function replayPage(authorIds: readonly string[], next?: string): Response {
  const body = {
    continuationContents: {
      liveChatContinuation: {
        actions: authorIds.map((authorExternalChannelId) => ({
          replayChatItemAction: {
            actions: [{ addChatItemAction: { item: { liveChatTextMessageRenderer: { authorExternalChannelId } } } }],
          },
        })),
        continuations: [
          ...(next ? [{ liveChatReplayContinuationData: { continuation: next } }] : []),
          { playerSeekContinuationData: { continuation: 'seek' } },
        ],
      },
    },
  };

  return new Response(JSON.stringify(body), { status: 200 });
}

/**
 * A fetch that answers the watch page first and then the given replay pages in
 * order, so a test says what the replay contains and nothing else.
 */
function serves(pages: readonly Response[], page: Response = watchPage()) {
  const replies = [page, ...pages];
  let served = 0;

  return vi.fn<typeof fetch>(async () => replies[served++] ?? replayPage([]));
}

describe('runChatReplay', () => {
  // Storage resets per test file rather than per test - the same finding
  // channel-stats.test.ts records - and this job's whole point is state that
  // survives a run, so every test starts from a table it emptied itself.
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM chat_author').run();
    await env.DB.prepare("DELETE FROM collect_task WHERE kind = 'chat_replay'").run();
    await env.DB.prepare('DELETE FROM video').run();
    await insertChannel();

    vi.useFakeTimers();
    vi.setSystemTime(SCANNING_MINUTE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Grouped rather than left flat, which the other worker suites are: one tick
  // does one of three things, and which of them it did is what almost every
  // test below is about. Flat, the thirty-odd names would not say which.
  describe('queueing', () => {
    test('touches nothing and calls nobody when there are no videos', async () => {
      const fetchImpl = vi.fn<typeof fetch>();

      await runChatReplay(env, fetchImpl);

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await allTasks()).toEqual([]);
    });

    test('queues a stream that ended and has no chat count', async () => {
      await insertVideo('vid-ended');

      await runChatReplay(env, vi.fn<typeof fetch>());

      expect(await allTasks()).toEqual([
        expect.objectContaining({ target_id: 'vid-ended', state: 'pending', attempts: 0, cursor: null }),
      ]);
    });

    test('leaves a video that never ended alone, because it has no replay yet', async () => {
      await insertVideo('vid-live', null);

      await runChatReplay(env, vi.fn<typeof fetch>());

      expect(await allTasks()).toEqual([]);
    });

    test('leaves a video that already has a count alone', async () => {
      await insertVideo('vid-counted');
      await env.DB.prepare("UPDATE video SET chat_message_count = 5 WHERE video_id = 'vid-counted'").run();

      await runChatReplay(env, vi.fn<typeof fetch>());

      expect(await allTasks()).toEqual([]);
    });

    // Settled rows stay settled: a video confirmed to have no chat, or one
    // already counted, must not come back round on the next scan.
    test('never queues a video a second time', async () => {
      await insertVideo('vid-settled');
      await env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
         VALUES ('chat_replay', 'vid-settled', 'unavailable', 0, NULL, '2026-01-01T00:00:00Z')`,
      ).run();

      await runChatReplay(env, vi.fn<typeof fetch>());

      expect(await allTasks()).toEqual([expect.objectContaining({ state: 'unavailable' })]);
    });

    // The scan is the expensive half and has no index to use (#83), so a tick
    // that is not on the scanning minute must not run it.
    test('does not scan on a minute it is not allowed to', async () => {
      await insertVideo('vid-ended');
      vi.setSystemTime(QUIET_MINUTE);

      await runChatReplay(env, vi.fn<typeof fetch>());

      expect(await allTasks()).toEqual([]);
    });

    // Queued work comes first whatever the minute is, so a backlog drains
    // without paying for a scan every tick.
    test('works the queue on a minute it would not scan on', async () => {
      await insertVideo('vid-queued');
      await queue('vid-queued');
      vi.setSystemTime(QUIET_MINUTE);

      await runChatReplay(env, serves([replayPage(['author-1'])]));

      expect((await allVideos())[0]).toMatchObject({ chat_message_count: 1 });
    });
  });

  describe('counting', () => {
    test('counts one video to the end and clears its working rows', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      const fetchImpl = serves([
        replayPage(['author-1', 'author-2'], 'page-2'),
        replayPage(['author-2', 'author-3'], 'page-3'),
        replayPage([]),
      ]);

      await runChatReplay(env, fetchImpl);

      // Four messages from three people: the two counts measure the same
      // items, one as a total and one as a distinct count.
      expect(await allVideos()).toEqual([{ video_id: 'vid-1', chat_message_count: 4, chat_unique_user_count: 3 }]);
      expect(await authorCount('vid-1')).toEqual(0);
      expect(await allTasks()).toEqual([
        expect.objectContaining({ target_id: 'vid-1', state: 'done', cursor: null, next_attempt_at: null }),
      ]);
    });

    test('reads the watch page once and then only the replay endpoint', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      const fetchImpl = serves([replayPage(['author-1'], 'page-2'), replayPage([])]);

      await runChatReplay(env, fetchImpl);

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(String((fetchImpl.mock.calls[0][0] as Request | URL | string).toString())).toContain('/watch?v=vid-1');
      expect((fetchImpl.mock.calls[1][0] as Request).url).toContain('get_live_chat_replay');
    });

    test('writes no count until the last page, so a part-counted video reads as uncounted', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      // Never runs out: every page offers another, so the run ends on its page
      // budget rather than on the replay.
      const fetchImpl = vi.fn<typeof fetch>(async (input) =>
        String(input instanceof Request ? input.url : input).includes('/watch')
          ? watchPage()
          : replayPage(['author-1'], 'page-next'),
      );

      await runChatReplay(env, fetchImpl);

      expect((await allVideos())[0]).toMatchObject({ chat_message_count: null, chat_unique_user_count: null });

      const [task] = await allTasks();
      expect(task).toMatchObject({ state: 'pending', attempts: 0 });
      expect(JSON.parse(task.cursor!)).toMatchObject({ continuation: 'page-next', messages: 40 });
      // Released the moment the run stopped, so the next tick carries on
      // rather than waiting out a lease.
      expect(task.next_attempt_at).toEqual('2026-01-01T00:10:00Z');
    });

    // A cron trigger does not wait for the tick before it. While a run is
    // paging, its video has to stay claimed, or the next tick takes it and the
    // two count the same replay from different places.
    test('holds the lease across pages rather than releasing it on each one', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      // Read part-way through rather than afterwards: what matters is the row
      // a second tick would find while this one is still paging, and that is
      // gone by the time the run returns.
      const between: TaskRow[] = [];
      let replays = 0;

      const fetchImpl = vi.fn<typeof fetch>(async (input) => {
        if (String(input instanceof Request ? input.url : input).includes('/watch')) {
          return watchPage();
        }

        replays++;

        if (replays > 1) {
          // Every page but the first is asked for after the page before it was
          // written, so this is the row as that write left it.
          between.push((await allTasks())[0]);
        }

        return replays < 3 ? replayPage(['author-1'], `page-${replays + 1}`) : replayPage([]);
      });

      await runChatReplay(env, fetchImpl);

      expect(between).toHaveLength(2);

      for (const task of between) {
        expect(task.state).toEqual('running');
        // Held out to the lease deadline, not left due on the spot.
        expect(task.next_attempt_at).toEqual('2026-01-01T00:25:00Z');
      }

      expect((await allTasks())[0]).toMatchObject({ state: 'done' });
    });

    test('carries on from the cursor rather than starting the video again', async () => {
      await insertVideo('vid-1');
      await queue(
        'vid-1',
        JSON.stringify({ continuation: 'page-7', messages: 300, apiKey: 'k', clientVersion: '9.9' }),
      );

      const fetchImpl = vi.fn<typeof fetch>(async () => replayPage(['author-1']));

      await runChatReplay(env, fetchImpl);

      // No watch page: the cursor still had usable credentials.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await (fetchImpl.mock.calls[0][0] as Request).json()).toMatchObject({ continuation: 'page-7' });
      expect((await allVideos())[0]).toMatchObject({ chat_message_count: 301 });
    });

    // Progress is kept and the credentials are not, so a resumed video reads a
    // fresh watch page and then picks up where it stopped.
    test('reopens the watch page for a cursor that lost its credentials', async () => {
      await insertVideo('vid-1');
      await queue('vid-1', JSON.stringify({ continuation: 'page-7', messages: 300 }));

      const fetchImpl = serves([replayPage(['author-1'])]);

      await runChatReplay(env, fetchImpl);

      expect(await (fetchImpl.mock.calls[1][0] as Request).json()).toMatchObject({ continuation: 'page-7' });
      expect((await allVideos())[0]).toMatchObject({ chat_message_count: 301 });
    });

    test('counts one person who said several things once in the unique count', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(env, serves([replayPage(['author-1', 'author-1', 'author-1'])]));

      expect(await allVideos()).toEqual([{ video_id: 'vid-1', chat_message_count: 3, chat_unique_user_count: 1 }]);
    });

    test('keeps one person counted once across pages', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(env, serves([replayPage(['author-1'], 'page-2'), replayPage(['author-1'])]));

      expect(await allVideos()).toEqual([{ video_id: 'vid-1', chat_message_count: 2, chat_unique_user_count: 1 }]);
    });

    test('records an ended replay with no messages as zero rather than nothing', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(env, serves([replayPage([])]));

      expect(await allVideos()).toEqual([{ video_id: 'vid-1', chat_message_count: 0, chat_unique_user_count: 0 }]);
    });

    test('takes one video per tick, leaving the rest queued', async () => {
      await insertVideo('vid-1');
      await insertVideo('vid-2');
      await queue('vid-1');
      await queue('vid-2');

      await runChatReplay(env, serves([replayPage(['author-1'])]));

      const states = (await allTasks()).map((task) => task.state);
      expect(states.filter((state) => state === 'done')).toHaveLength(1);
      expect(states.filter((state) => state !== 'done')).toHaveLength(1);
    });
  });

  describe('when it cannot count', () => {
    test('settles a playable video with no chat as unavailable, not as a failure', async () => {
      await insertVideo('vid-nochat');
      await queue('vid-nochat');

      await runChatReplay(env, serves([], watchPage({ conversationBar: false })));

      expect(await allTasks()).toEqual([
        expect.objectContaining({ target_id: 'vid-nochat', state: 'unavailable', next_attempt_at: null }),
      ]);
      expect((await allVideos())[0]).toMatchObject({ chat_message_count: null });
    });

    // A video can reach 'absent' after pages of it were counted - the chat was
    // there and then was not - and nothing comes back for a settled task, so
    // the working rows would sit there for good.
    test('clears the working rows of a video that turns out to have no chat', async () => {
      await insertVideo('vid-gone-chat');
      await queue('vid-gone-chat', JSON.stringify({ continuation: 'page-7', messages: 300 }));
      await env.DB.prepare("INSERT INTO chat_author (video_id, author_id) VALUES ('vid-gone-chat', 'author-1')").run();

      await runChatReplay(env, serves([], watchPage({ conversationBar: false })));

      expect((await allTasks())[0]).toMatchObject({ state: 'unavailable' });
      expect(await authorCount('vid-gone-chat')).toEqual(0);
    });

    test('keeps a video that will not play retryable rather than calling its chat absent', async () => {
      await insertVideo('vid-gone');
      await queue('vid-gone');

      await runChatReplay(env, serves([], watchPage({ playability: 'ERROR' })));

      const [task] = await allTasks();
      expect(task).toMatchObject({ state: 'failed', attempts: 1 });
      expect(task.next_attempt_at).not.toBeNull();
    });

    test('retries when the watch page itself will not load', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(
        env,
        vi.fn<typeof fetch>(async () => new Response('nope', { status: 503 })),
      );

      expect((await allTasks())[0]).toMatchObject({ state: 'failed', attempts: 1 });
    });

    test('retries when a replay page will not load, keeping what it counted', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(env, serves([replayPage(['author-1'], 'page-2'), new Response('nope', { status: 500 })]));

      const [task] = await allTasks();
      expect(task).toMatchObject({ state: 'failed', attempts: 1 });
      // The first page's message survives, and its author is still banked.
      expect(JSON.parse(task.cursor!)).toEqual({ continuation: 'page-2', messages: 1 });
      expect(await authorCount('vid-1')).toEqual(1);
      expect((await allVideos())[0]).toMatchObject({ chat_message_count: null });
    });

    // A replay that has run out drops its continuation; one that drops its
    // envelope is an answer we did not understand.
    test('retries a response that is not a replay page rather than calling it finished', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(env, serves([new Response('{"error":{"code":400}}', { status: 200 })]));

      expect((await allTasks())[0]).toMatchObject({ state: 'failed', attempts: 1 });
      expect((await allVideos())[0]).toMatchObject({ chat_message_count: null });
    });

    test('backs off further the more times in a row a video fails', async () => {
      await insertVideo('vid-1');
      await queue('vid-1', null, 3);

      await runChatReplay(
        env,
        vi.fn<typeof fetch>(async () => new Response('nope', { status: 503 })),
      );

      const [task] = await allTasks();
      expect(task.attempts).toEqual(4);
      // 5 minutes doubled four times, from the pinned clock.
      expect(task.next_attempt_at).toEqual('2026-01-01T01:30:00Z');
    });

    test('starts counting again from zero attempts once a page lands', async () => {
      await insertVideo('vid-1');
      await queue('vid-1', null, 3);

      await runChatReplay(env, serves([replayPage(['author-1'], 'page-2'), replayPage([])]));

      expect((await allTasks())[0]).toMatchObject({ state: 'done', attempts: 0 });
    });

    // A video that is moving, one page at a time, must not inherit the backoff
    // of one that has never managed anything: the count of failures in a row
    // is what the delay is built on, and a page that landed ends the row.
    test('counts a failure after a landed page as the first, not the next', async () => {
      await insertVideo('vid-1');
      await queue('vid-1', null, 3);

      await runChatReplay(env, serves([replayPage(['author-1'], 'page-2'), new Response('nope', { status: 500 })]));

      const [task] = await allTasks();
      expect(task.attempts).toEqual(1);
      // 5 minutes doubled once, not four times, from the pinned clock.
      expect(task.next_attempt_at).toEqual('2026-01-01T00:20:00Z');
    });

    // The path the schema's own comment cares about: a page's authors and the
    // cursor that steps past it are one transaction, so a write that fails
    // cannot leave the video counting on from a page whose authors were lost.
    //
    // The write is made to fail for real rather than mocked: chat_author has a
    // foreign key to `video`, so a queued video with no row there is refused
    // by SQLite itself.
    test('does not advance the cursor when the authors cannot be written', async () => {
      await queue('vid-missing');

      await runChatReplay(env, serves([replayPage(['author-1'], 'page-2'), replayPage([])]));

      const [task] = await allTasks();
      expect(task).toMatchObject({ state: 'failed', attempts: 1 });
      // No cursor, because nothing landed: the page whose authors were refused
      // was not counted either, so the retry starts the video over rather than
      // carrying on past a page it never took.
      expect(task.cursor).toBeNull();
      expect(await authorCount('vid-missing')).toEqual(0);
    });

    test('starts a video over when its cursor is not readable', async () => {
      await insertVideo('vid-1');
      await queue('vid-1', 'not json');

      await runChatReplay(env, serves([replayPage(['author-1'])]));

      expect((await allVideos())[0]).toMatchObject({ chat_message_count: 1 });
    });

    // The lease: a tick that died left its row 'running', and the same clause
    // that makes a failed row due again has to reach it.
    test('retakes a video a dead tick left claimed', async () => {
      await insertVideo('vid-stuck');
      await env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
         VALUES ('chat_replay', 'vid-stuck', 'running', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      ).run();

      await runChatReplay(env, serves([replayPage(['author-1'])]));

      expect((await allTasks())[0]).toMatchObject({ state: 'done' });
    });

    test('leaves a video claimed by a tick still running alone', async () => {
      await insertVideo('vid-busy');
      await env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
         VALUES ('chat_replay', 'vid-busy', 'running', 0, '2026-01-01T00:20:00Z', '2026-01-01T00:09:00Z')`,
      ).run();

      const fetchImpl = vi.fn<typeof fetch>();

      await runChatReplay(env, fetchImpl);

      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await allTasks())[0]).toMatchObject({ state: 'running' });
    });

    // -1 is what the system this replaces wrote to give up. Nothing here may.
    test('never writes a negative count', async () => {
      await insertVideo('vid-1');
      await queue('vid-1');

      await runChatReplay(env, serves([], watchPage({ playability: 'ERROR' })));

      const [video] = await allVideos();
      expect(video.chat_message_count).toBeNull();
      expect(video.chat_unique_user_count).toBeNull();
    });

    // A cursor that would only be refused at the end, after the whole replay
    // had been read: the CHECK on chat_message_count takes whole numbers that
    // are not negative, so a cursor carrying anything else starts over.
    test('starts a video over rather than carrying on from a count no column would take', async () => {
      await insertVideo('vid-1');
      await queue('vid-1', JSON.stringify({ continuation: 'page-7', messages: -5, apiKey: 'k', clientVersion: '9.9' }));

      const fetchImpl = serves([replayPage(['author-1'])]);

      await runChatReplay(env, fetchImpl);

      // The watch page was read again, and the count starts from this run.
      expect(String(fetchImpl.mock.calls[0][0])).toContain('/watch?v=vid-1');
      expect((await allVideos())[0]).toMatchObject({ chat_message_count: 1 });
    });
  });
});
