import { AdminApiError } from '@/admin/lib/api';
import {
  blocksAdding,
  createRequestGate,
  isChannelIdShape,
  lookupFailure,
  lookupFound,
  lookupView,
  type ChannelLookup,
} from '@/admin/lib/channel-lookup';

const ID = 'UCEcMIuGR8WO2TwL9XIpjKtw';
const OTHER = 'UC0123456789abcdefghijkl';

describe('isChannelIdShape', () => {
  test('accepts UC and 22 characters of base64url', () => {
    expect(isChannelIdShape(ID)).toBe(true);
    expect(isChannelIdShape('UC-_-_-_-_-_-_-_-_-_-_-_')).toBe(true);
  });

  test('refuses anything still being typed, or of another shape', () => {
    for (const value of [
      '',
      'U',
      'UC',
      ID.slice(0, 23),
      `${ID}x`,
      `XC${ID.slice(2)}`,
      ` ${ID}`,
      `UC${'あ'.repeat(22)}`,
    ]) {
      expect(isChannelIdShape(value)).toBe(false);
    }
  });
});

describe('lookupView', () => {
  const found: ChannelLookup = { status: 'found', channelId: ID, title: 'ケープペンギン', iconDataUrl: null };

  test('waits while the id is not yet in shape, whatever a lookup says', () => {
    expect(lookupView('', null)).toBe('waiting');
    expect(lookupView(ID.slice(0, 23), found)).toBe('waiting');
  });

  test('is loading for an id in shape that nothing has answered yet', () => {
    expect(lookupView(ID, null)).toBe('loading');
    expect(lookupView(ID, { status: 'loading', channelId: ID })).toBe('loading');
  });

  test('draws the answer for this id', () => {
    expect(lookupView(ID, found)).toBe('found');
    expect(lookupView(ID, { status: 'notFound', channelId: ID })).toBe('notFound');
    expect(lookupView(ID, { status: 'failed', channelId: ID })).toBe('failed');
  });

  test('ignores an answer that was asked for another id, so a stale one cannot overwrite what is typed now', () => {
    expect(lookupView(OTHER, found)).toBe('loading');
    expect(lookupView(OTHER, { status: 'notFound', channelId: ID })).toBe('loading');
  });

  test('reads the id as 一覧に追加 will: with the spaces around it trimmed', () => {
    expect(lookupView(`  ${ID} `, found)).toBe('found');
  });
});

describe('lookupFailure', () => {
  test('is notFound for the worker 404 that says YouTube has no such channel', () => {
    expect(lookupFailure(new AdminApiError(404, { error: 'x', code: 'channel_not_found' }), ID)).toEqual({
      status: 'notFound',
      channelId: ID,
    });
  });

  test('is failed for a 404 that does not carry the code, such as a route the worker lacks', () => {
    for (const body of [{ error: 'no endpoint at /admin/api/channel-lookup/x' }, null, 'Not Found']) {
      expect(lookupFailure(new AdminApiError(404, body), ID)).toEqual({ status: 'failed', channelId: ID });
    }
  });

  test('is failed when the code comes with another status', () => {
    expect(lookupFailure(new AdminApiError(502, { code: 'channel_not_found' }), ID)).toEqual({
      status: 'failed',
      channelId: ID,
    });
  });

  test('is failed for every other failure, which says nothing about the id', () => {
    for (const error of [
      new AdminApiError(502, { error: 'x' }),
      new AdminApiError(500, null),
      new AdminApiError(401, null),
      new AdminApiError(0, 'could not be reached'),
      new TypeError('boom'),
    ]) {
      expect(lookupFailure(error, ID)).toEqual({ status: 'failed', channelId: ID });
    }
  });
});

describe('lookupFound', () => {
  test('keeps the id the worker answered for, with the title and the icon', () => {
    expect(lookupFound({ channelId: ID, title: 'ケープペンギン', iconDataUrl: 'data:image/png;base64,AA==' })).toEqual({
      status: 'found',
      channelId: ID,
      title: 'ケープペンギン',
      iconDataUrl: 'data:image/png;base64,AA==',
    });
  });
});

describe('blocksAdding', () => {
  test('refuses only for a channel YouTube does not know', () => {
    expect(blocksAdding('notFound')).toBe(true);

    for (const view of ['waiting', 'loading', 'found', 'failed'] as const) expect(blocksAdding(view)).toBe(false);
  });
});

describe('createRequestGate', () => {
  test('makes the latest request the only current one', () => {
    const gate = createRequestGate();
    const first = gate.start();
    const second = gate.start();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  test('makes every request in flight stale once cancelled', () => {
    const gate = createRequestGate();
    const ticket = gate.start();

    gate.cancel();

    expect(gate.isCurrent(ticket)).toBe(false);
  });
});
