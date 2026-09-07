import { chatContinuation, parseReplayPage, readReplayError, replayRequest } from '../src/lib/live-chat';

/** One replay response. `items` names the renderer and its author, if any. */
function replayResponse(items: readonly { renderer: string; author?: string }[], next?: string) {
  return {
    continuationContents: {
      liveChatContinuation: {
        actions: items.map(({ renderer, author }) => ({
          replayChatItemAction: {
            actions: [
              {
                addChatItemAction: {
                  item: { [renderer]: author ? { authorExternalChannelId: author, id: 'unused' } : { id: 'unused' } },
                },
              },
            ],
          },
        })),
        // The player's seek continuation is always there; the replay one is
        // what runs out, which is how the end is recognised.
        continuations: [
          ...(next ? [{ liveChatReplayContinuationData: { continuation: next } }] : []),
          { playerSeekContinuationData: { continuation: 'seek' } },
        ],
      },
    },
  };
}

describe('chatContinuation', () => {
  // The one that matters: this is the exact string YouTube's own watch page
  // handed out for this video, captured while the page could still be read.
  // Building it rather than reading it is what let the job stop asking for a
  // page that a Cloudflare address is refused (#92), so a change that alters
  // the bytes has stopped doing the thing this rests on. Two field numbers in
  // chatContinuation are copied without being understood; this is what says
  // they are still right.
  //
  // Real values on purpose, and the only place in these tests with any. What
  // must not be written down is who said what in a chat - author names and
  // ids. A continuation holds neither: it is a channel id, which channels.yml
  // already lists, and the id of a public video.
  test('builds the continuation the watch page used to hand out', () => {
    expect(chatContinuation('UCYa58DdXGAGMJQHqTxi-isA', 'LdoAcMRyX9s')).toEqual(
      'op2w0wRyGl5DaWtxSndvWVZVTlpZVFU0UkdSWVIwRkhUVXBSU0hGVWVHa3RhWE5CRWd0TVpHOUJZMDFTZVZnNWN4b1Q2cWpkdVFFTkNndE1aRzlCWTAxU2VWZzVjeUFCTUFBJTNEQAFyDAgEGAIgACgAMAA4AHgB',
    );
  });

  test('depends on both ids, so no two videos share a continuation', () => {
    const one = chatContinuation('UCYa58DdXGAGMJQHqTxi-isA', 'LdoAcMRyX9s');

    expect(chatContinuation('UCYa58DdXGAGMJQHqTxi-isA', 'vMi7hvvKY5c')).not.toEqual(one);
    expect(chatContinuation('UCNObi6xvj6QeZ0g7BhAbF7w', 'LdoAcMRyX9s')).not.toEqual(one);
  });

  test('carries both ids, which is all it is made of', () => {
    const decoded = atob(
      chatContinuation('UCYa58DdXGAGMJQHqTxi-isA', 'LdoAcMRyX9s').replace(/-/g, '+').replace(/_/g, '/'),
    );
    const inner = atob(decodeURIComponent(/[A-Za-z0-9+/]{40,}%3D/.exec(decoded)?.[0] ?? ''));

    expect(inner).toContain('UCYa58DdXGAGMJQHqTxi-isA');
    expect(inner).toContain('LdoAcMRyX9s');
  });

  // The padding of the nested message arrives URL-escaped in YouTube's own
  // continuations, and one built with a bare '=' instead is refused.
  test('escapes the padding of the message it nests', () => {
    const decoded = atob(
      chatContinuation('UCYa58DdXGAGMJQHqTxi-isA', 'LdoAcMRyX9s').replace(/-/g, '+').replace(/_/g, '/'),
    );

    expect(decoded).toContain('%3D');
    expect(decoded).not.toContain('=');
  });
});

describe('replayRequest', () => {
  const request = replayRequest('page-one');

  test('posts to the replay endpoint', () => {
    expect(request.method).toEqual('POST');
    expect(new URL(request.url).pathname).toEqual('/youtubei/v1/live_chat/get_live_chat_replay');
  });

  // Not an omission, and this is what says so. The endpoint was measured to
  // answer a correct key, a wrong key, an empty key and no key parameter at
  // all identically - down to the same page of the same replay - so there is
  // nothing to send. A key that used to sit here was reported as a leaked
  // credential (#92); the way to stop that report from recurring, and from
  // teaching everyone to ignore the next one, is to have no such value rather
  // than a secret holding one nobody needs.
  //
  // Left untested, somebody adds a key back for tidiness and the value
  // returns. This is what catches that.
  test('sends no key, because the endpoint does not take one', () => {
    expect(new URL(request.url).searchParams.get('key')).toBeNull();
    expect(request.url).not.toContain('key=');
  });

  // The one part of this request whose absence looks like nothing. fetch
  // ignores a signal handed to it beside a Request it has already been given,
  // without an error and with the types intact, so a deadline built that way
  // would never fire and every request would take as long as the endpoint
  // wanted it to (#68). Checking the signal is here is checking the only
  // place it works.
  test("carries a signal that is still the caller's, so a deadline can reach it", () => {
    const controller = new AbortController();
    const asked = replayRequest('page-one', controller.signal);

    expect(asked.signal.aborted).toBe(false);

    controller.abort();

    expect(asked.signal.aborted).toBe(true);
  });

  test('carries the continuation and a client version', async () => {
    const body = (await request.json()) as { context: { client: { clientVersion: string } }; continuation: string };

    expect(body.continuation).toEqual('page-one');
    // Pinned rather than read from a page. A real version is what the endpoint
    // wants; how old it is does not matter to it.
    expect(body.context.client.clientVersion).toMatch(/^2\.\d{8}\.\d{2}\.\d{2}$/);
  });
});

describe('readReplayError', () => {
  // A 404 has two causes and the pinned version is one of them, the only part
  // of the request that goes stale while nobody is touching it. When every
  // video starts failing at once, the log has to say where to look.
  test('names the pinned client version on a 404', () => {
    expect(readReplayError(404)).toContain('client version');
    expect(readReplayError(404)).toMatch(/2\.\d{8}\.\d{2}\.\d{2}/);
  });

  // The other cause, and the one #100 measured: a video that had been taken
  // down, answered 404 while every other video went on working. The message
  // used to name only the version, and a reader of that line went to edit a
  // constant that was not the problem.
  test('offers the missing video as a cause on a 404, and does not settle on one', () => {
    const message = readReplayError(404);

    expect(message).toContain('video');
    expect(message).toMatch(/either/i);
    // How to tell them apart, which is the count rather than the status.
    expect(message).toContain('every video');
  });

  // The other half of the request, and a different fault. These two were
  // written the wrong way round at first, so each is pinned down here.
  test('blames the continuation on a 400, and not the version', () => {
    expect(readReplayError(400)).toContain('continuation');
    expect(readReplayError(400)).not.toContain('client version');
  });

  test('says only the status for anything else', () => {
    expect(readReplayError(503)).toEqual('the replay endpoint responded 503');
    expect(readReplayError(403)).not.toContain('client version');
    expect(readReplayError(403)).not.toContain('continuation');
  });
});

describe('parseReplayPage', () => {
  test('counts one author per item and hands back the next continuation', () => {
    const page = parseReplayPage(
      replayResponse(
        [
          { renderer: 'liveChatTextMessageRenderer', author: 'author-1' },
          { renderer: 'liveChatTextMessageRenderer', author: 'author-2' },
        ],
        'page-two',
      ),
    );

    expect(page).toEqual({ authorIds: ['author-1', 'author-2'], messageCount: 2, continuation: 'page-two' });
  });

  test('counts anything a viewer posted, whatever the renderer is called', () => {
    const renderers = [
      'liveChatTextMessageRenderer',
      'liveChatPaidMessageRenderer',
      'liveChatPaidStickerRenderer',
      'liveChatMembershipItemRenderer',
      'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer',
      'liveChatSponsorshipsGiftRedemptionAnnouncementRenderer',
      // The point of the rule: a type nobody has seen is counted anyway.
      'aRendererNobodyHasSeenYet',
    ];

    for (const renderer of renderers) {
      expect(parseReplayPage(replayResponse([{ renderer, author: 'author-1' }], 'next'))?.messageCount).toEqual(1);
    }
  });

  test("does not count YouTube's own messages, which carry no author", () => {
    const page = parseReplayPage(
      replayResponse(
        [
          { renderer: 'liveChatViewerEngagementMessageRenderer' },
          { renderer: 'liveChatTextMessageRenderer', author: 'author-1' },
        ],
        'next',
      ),
    );

    expect(page).toEqual({ authorIds: ['author-1'], messageCount: 1, continuation: 'next' });
  });

  test('keeps a repeated author once per message, because the count is of messages', () => {
    const page = parseReplayPage(
      replayResponse(
        [
          { renderer: 'liveChatTextMessageRenderer', author: 'author-1' },
          { renderer: 'liveChatTextMessageRenderer', author: 'author-1' },
        ],
        'next',
      ),
    );

    expect(page).toEqual({ authorIds: ['author-1', 'author-1'], messageCount: 2, continuation: 'next' });
  });

  // The two shapes that both mean "nothing more to read here" and must not be
  // confused. The end of a replay keeps the envelope; a video with no replay
  // has no envelope at all. Size is not what tells them apart - a stream with
  // one short page ends with an envelope too - the envelope is.
  describe('the end of a replay against a video that has none', () => {
    test('reports the last page of a replay by its missing continuation', () => {
      expect(parseReplayPage(replayResponse([]))).toEqual({ authorIds: [], messageCount: 0, continuation: null });
    });

    test('reports a replay that ends after one short page the same way', () => {
      const page = parseReplayPage(replayResponse([{ renderer: 'liveChatTextMessageRenderer', author: 'author-1' }]));

      expect(page).toEqual({ authorIds: ['author-1'], messageCount: 1, continuation: null });
    });

    test('reports a video with no replay as null, which is not a page at all', () => {
      // What the endpoint answers for a video that never had a chat: the
      // envelope is missing rather than empty.
      expect(parseReplayPage({ responseContext: { visitorData: 'unused' } })).toBeNull();
    });

    test('tells an empty page from a missing one', () => {
      const empty = parseReplayPage(replayResponse([]));
      const missing = parseReplayPage({ responseContext: {} });

      expect(empty).not.toBeNull();
      expect(missing).toBeNull();
    });
  });

  test('survives a page with no actions at all', () => {
    expect(parseReplayPage({ continuationContents: { liveChatContinuation: {} } })).toEqual({
      authorIds: [],
      messageCount: 0,
      continuation: null,
    });
  });

  test('refuses a body that is not a replay page at all', () => {
    for (const body of [{}, null, undefined, { continuationContents: {} }, 'not json at all', 42]) {
      expect(parseReplayPage(body)).toBeNull();
    }
  });
});
