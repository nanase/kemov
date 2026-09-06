import { parseReplayPage, parseWatchPage, replayRequest, watchUrl } from '../src/lib/live-chat';

// Shaped like the real thing and made up entirely. Nothing a real chat replay
// returns belongs in this repository: the ids below name nobody, and the
// author ids are the only field of a real response this job even reads.
function watchPage(parts: {
  playability?: string;
  conversationBar?: boolean;
  apiKey?: boolean;
  continuation?: boolean;
}) {
  const { playability = 'OK', conversationBar = true, apiKey = true, continuation = true } = parts;

  return [
    `{"playabilityStatus":{"status":"${playability}","playableInEmbed":true},`,
    apiKey ? '"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"9.99999999.99.99",' : '',
    conversationBar ? '"conversationBar":{"liveChatRenderer":{"continuations":[' : '',
    conversationBar && continuation ? '{"reloadContinuationData":{"continuation":"page-one"}}' : '',
    conversationBar ? ']}},' : '',
    '"trackingParams":"unused"}',
  ].join('');
}

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

describe('watchUrl', () => {
  test('names the video', () => {
    expect(watchUrl('abcdefghijk')).toEqual('https://www.youtube.com/watch?v=abcdefghijk');
  });

  test('escapes an id rather than letting it add parameters', () => {
    expect(watchUrl('a&b=c')).toEqual('https://www.youtube.com/watch?v=a%26b%3Dc');
  });
});

describe('replayRequest', () => {
  const request = replayRequest({ apiKey: 'test-key', clientVersion: '9.9', continuation: 'page-one' });

  test('posts to the replay endpoint with the key', () => {
    expect(request.method).toEqual('POST');
    expect(new URL(request.url).pathname).toEqual('/youtubei/v1/live_chat/get_live_chat_replay');
    expect(new URL(request.url).searchParams.get('key')).toEqual('test-key');
  });

  test('carries the continuation and the version the page reported', async () => {
    expect(await request.json()).toEqual({
      context: { client: { clientName: 'WEB', clientVersion: '9.9' } },
      continuation: 'page-one',
    });
  });
});

describe('parseWatchPage', () => {
  test('reads the key, the version and the first continuation', () => {
    expect(parseWatchPage(watchPage({}))).toEqual({
      kind: 'replay',
      apiKey: 'test-key',
      clientVersion: '9.99999999.99.99',
      continuation: 'page-one',
    });
  });

  // The one case that settles a task as 'unavailable', so the one that must
  // not be reached by any other shape of page.
  test('reports a playable video with no chat panel as an absent replay', () => {
    expect(parseWatchPage(watchPage({ conversationBar: false }))).toEqual({ kind: 'absent' });
  });

  // A video that will not play says nothing about whether it had a chat, so
  // none of these may end a task as a confirmed absence.
  test('refuses to call a video that will not play an absent replay', () => {
    for (const playability of ['ERROR', 'LOGIN_REQUIRED', 'UNPLAYABLE', 'AGE_VERIFICATION_REQUIRED']) {
      const page = parseWatchPage(watchPage({ playability, conversationBar: false }));

      expect(page).toMatchObject({ kind: 'unusable' });
    }
  });

  test('reports a page with no playability status at all as unusable', () => {
    expect(parseWatchPage('<html>nothing useful</html>')).toMatchObject({ kind: 'unusable' });
  });

  test('reports a chat panel it cannot open as unusable rather than absent', () => {
    const page = parseWatchPage(watchPage({ apiKey: false }));

    expect(page).toMatchObject({ kind: 'unusable' });
    expect(page.kind === 'unusable' && page.why).toContain('INNERTUBE_API_KEY');
  });

  test('names every part it could not find', () => {
    const page = parseWatchPage(watchPage({ apiKey: false, continuation: false }));

    expect(page.kind === 'unusable' && page.why).toContain('INNERTUBE_API_KEY');
    expect(page.kind === 'unusable' && page.why).toContain('the chat continuation');
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

  // The reason the count is defined by the author field rather than by a list
  // of renderer names: these four were measured, and two more turned up on a
  // different stream. A list would have missed them in silence.
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

  // How a replay ends: the envelope stays, the replay continuation goes.
  test('reports the last page by its missing continuation', () => {
    expect(parseReplayPage(replayResponse([]))).toEqual({ authorIds: [], messageCount: 0, continuation: null });
  });

  test('survives a page with no actions at all', () => {
    expect(parseReplayPage({ continuationContents: { liveChatContinuation: {} } })).toEqual({
      authorIds: [],
      messageCount: 0,
      continuation: null,
    });
  });

  // Distinct from the end of a replay on purpose: one is a finished video, the
  // other is an answer we did not understand and must retry.
  test('refuses a body that is not a replay page at all', () => {
    for (const body of [{}, null, undefined, { continuationContents: {} }, 'not json at all', 42]) {
      expect(parseReplayPage(body)).toBeNull();
    }
  });
});
