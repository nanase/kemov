import {
  canPublishFootprints,
  footprintsMarkFor,
  isChangedSincePublish,
  waitingEntryFor,
  type FootprintsPending,
} from '@/admin/lib/footprints-publish';

const NOTHING: FootprintsPending = { pending: [], changed: [] };
const WAITING: FootprintsPending = { pending: [{ eventId: 3, latestAction: 'publish' }], changed: [] };
const CHANGED: FootprintsPending = { pending: [], changed: [{ eventId: 5, title: '変わった行' }] };

describe('waitingEntryFor', () => {
  test('finds the entry for a waiting event', () => {
    expect(waitingEntryFor(WAITING, 3)).toEqual({ eventId: 3, latestAction: 'publish' });
  });

  test('is undefined for an event that is not waiting, and when the list is unknown', () => {
    expect(waitingEntryFor(WAITING, 4)).toBeUndefined();
    expect(waitingEntryFor(null, 3)).toBeUndefined();
  });
});

describe('isChangedSincePublish', () => {
  test('is true only for a listed event', () => {
    expect(isChangedSincePublish(CHANGED, 5)).toBe(true);
    expect(isChangedSincePublish(CHANGED, 6)).toBe(false);
    expect(isChangedSincePublish(null, 5)).toBe(false);
  });
});

// The button on the 公開 screen and the chip in the table read the same list:
// what one calls waiting the other must call waiting too.
describe('canPublishFootprints', () => {
  test('is false with nothing waiting', () => {
    expect(canPublishFootprints(NOTHING)).toBe(false);
  });

  test('is true with something waiting', () => {
    expect(canPublishFootprints(WAITING)).toBe(true);
  });

  // A row changed after it was published has no revision newer than the last
  // run, so 「いま公開する」 would answer "待っているものがありません" (#201).
  test('is false when a row has only changed since it was published', () => {
    expect(canPublishFootprints(CHANGED)).toBe(false);
  });
});

describe('footprintsMarkFor', () => {
  test('a published row waiting for 「いま公開する」 is 公開待ち', () => {
    expect(footprintsMarkFor('published', 3, WAITING)).toEqual({ label: '公開待ち', tone: 'waiting' });
  });

  // `status` does not change in the second step, so this is what tells the
  // two apart after 「いま公開する」 (#185).
  test('the same row is 公開 once nothing is waiting for it', () => {
    expect(footprintsMarkFor('published', 3, NOTHING)).toEqual({ label: '公開', tone: 'published' });
  });

  test('a published row that is not the waiting one is 公開', () => {
    expect(footprintsMarkFor('published', 4, WAITING)).toEqual({ label: '公開', tone: 'published' });
  });

  test('a published row is not called 公開 when the waiting list could not be read', () => {
    expect(footprintsMarkFor('published', 3, null)).toEqual({ label: '公開（未確認）', tone: 'unknown' });
  });

  test('a draft stays 下書き even while its withdrawal is waiting', () => {
    const withdrawing: FootprintsPending = { pending: [{ eventId: 3, latestAction: 'withdraw' }], changed: [] };

    expect(footprintsMarkFor('draft', 3, withdrawing)).toEqual({ label: '下書き', tone: 'draft' });
  });
});
