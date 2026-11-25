import { AdminApiError } from '@/admin/lib/api';
import {
  bandShown,
  footprintsBandText,
  genetBandText,
  milestonesBandText,
  republishedToast,
  republishFailedToast,
} from '@/admin/lib/republish';

const footprints = { pending: [], changed: [], behind: false, outdated: false };
const genet = { pending: [], changed: [], shapeOutdated: false, behind: false };
const milestones = { pending: [], changed: [], eventChanged: [], shapeOutdated: false, behind: false };

describe('footprintsBandText', () => {
  test('shows nothing while the JSON is up to date, or while that is unknown', () => {
    expect(footprintsBandText(footprints)).toBeNull();
    expect(footprintsBandText(null)).toBeNull();
  });

  test.each([
    ['may be behind', { behind: true }],
    ['is outdated', { outdated: true }],
    ['has a row waiting', { pending: [{ eventId: 1, latestAction: 'publish' }] }],
  ])('shows the message while the JSON %s', (_, change) => {
    expect(footprintsBandText({ ...footprints, ...change })).toBe('本番に反映されていない変更があります');
  });

  // A row changed after it was published has no newer revision: 「本番に反映」 would write nothing.
  test('shows nothing for a changed row alone', () => {
    expect(footprintsBandText({ ...footprints, changed: [{ eventId: 1, title: 't' }] })).toBeNull();
  });
});

describe('genetBandText', () => {
  test('shows nothing while the JSON is up to date', () => {
    expect(genetBandText(genet)).toBeNull();
    expect(genetBandText(null)).toBeNull();
  });

  test('says the shape can be brought up to date when only the shape is old', () => {
    expect(genetBandText({ ...genet, shapeOutdated: true })).toBe('本番のデータを新しい形式に更新できます');
  });

  test('says there are changes not on the public site otherwise', () => {
    expect(genetBandText({ ...genet, shapeOutdated: true, behind: true })).toBe('本番に反映されていない変更があります');
  });
});

describe('milestonesBandText', () => {
  test('shows nothing while the JSON is up to date', () => {
    expect(milestonesBandText(milestones)).toBeNull();
  });

  test('shows the message for a linked event the JSON is behind', () => {
    expect(milestonesBandText({ ...milestones, eventChanged: [{ milestoneId: 1, eventId: 2 }] })).toBe(
      '本番に反映されていない変更があります',
    );
  });

  test('says the shape can be brought up to date when only the shape is old', () => {
    expect(milestonesBandText({ ...milestones, shapeOutdated: true })).toBe('本番のデータを新しい形式に更新できます');
  });
});

describe('bandShown', () => {
  test('shows a message until a press goes through', () => {
    expect(bandShown('x', null, 3)).toBe(true);
  });

  // The press reads the pending state again as generation 4: that read is still hidden.
  test('hides it through the read the press started', () => {
    expect(bandShown('x', 4, 3)).toBe(false);
    expect(bandShown('x', 4, 4)).toBe(false);
  });

  // A write another request has not finished keeps the JSON called behind for a while.
  test('shows it again with a later read that still calls the JSON behind', () => {
    expect(bandShown('x', 4, 5)).toBe(true);
  });

  test('shows nothing without a message', () => {
    expect(bandShown(null, null, 0)).toBe(false);
  });
});

describe('the toasts', () => {
  test('say whether anything was written', () => {
    expect(republishedToast(true)).toBe('本番に反映しました');
    expect(republishedToast(false)).toBe('反映する変更はありません');
  });

  test("say a failure in the person's words, not the worker's", () => {
    expect(
      republishFailedToast(
        new AdminApiError(502, { error: 'footprints/events.json could not be brought up to date: x' }),
      ),
    ).toBe('本番への反映に失敗しました');
    expect(republishFailedToast(new TypeError('boom'))).toBe('本番への反映に失敗しました');
  });

  test('say the server could not be reached for a request that got no answer', () => {
    expect(republishFailedToast(new AdminApiError(0, '/footprints/publish could not be reached: TypeError'))).toBe(
      'サーバーに接続できませんでした',
    );
  });
});
