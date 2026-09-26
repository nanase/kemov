import {
  canPublishMilestones,
  isChangedSincePublish,
  isEventChanged,
  milestoneMarkFor,
  publishesOnlyForShape,
  waitingEntryFor,
  type MilestonesPending,
} from '@/admin/lib/subscriber-milestones-publish';

const NOTHING: MilestonesPending = { pending: [], changed: [], eventChanged: [], shapeOutdated: false };
const WAITING: MilestonesPending = { ...NOTHING, pending: [{ milestoneId: 3, latestAction: 'publish' }] };
const CHANGED: MilestonesPending = { ...NOTHING, changed: [{ milestoneId: 5 }] };
const EVENT_CHANGED: MilestonesPending = { ...NOTHING, eventChanged: [{ milestoneId: 6, eventId: 2 }] };
const SHAPE: MilestonesPending = { ...NOTHING, shapeOutdated: true };

describe('waitingEntryFor, isChangedSincePublish and isEventChanged', () => {
  test('find only the listed milestone', () => {
    expect(waitingEntryFor(WAITING, 3)).toEqual({ milestoneId: 3, latestAction: 'publish' });
    expect(waitingEntryFor(WAITING, 4)).toBeUndefined();
    expect(isChangedSincePublish(CHANGED, 5)).toBe(true);
    expect(isChangedSincePublish(CHANGED, 6)).toBe(false);
    expect(isEventChanged(EVENT_CHANGED, 6)).toBe(true);
    expect(isEventChanged(EVENT_CHANGED, 5)).toBe(false);
  });

  test('answer no when the list could not be read', () => {
    expect(waitingEntryFor(null, 3)).toBeUndefined();
    expect(isChangedSincePublish(null, 5)).toBe(false);
    expect(isEventChanged(null, 6)).toBe(false);
  });
});

// The button must be pressable in exactly the cases the worker builds in
// (`publishState`'s `needsBuild`): not stricter, not looser.
describe('canPublishMilestones', () => {
  test('is false with nothing to build', () => {
    expect(canPublishMilestones(NOTHING)).toBe(false);
  });

  test('is true with a milestone waiting, a linked event changed, or an old shape', () => {
    expect(canPublishMilestones(WAITING)).toBe(true);
    expect(canPublishMilestones(EVENT_CHANGED)).toBe(true);
    expect(canPublishMilestones(SHAPE)).toBe(true);
  });

  // Such a row has no revision newer than the last run until 「公開待ちにする」
  // is pressed again (#201).
  test('is false when a row has only changed since it was published', () => {
    expect(canPublishMilestones(CHANGED)).toBe(false);
  });
});

describe('publishesOnlyForShape', () => {
  test('is true only when the shape is the one reason', () => {
    expect(publishesOnlyForShape(SHAPE)).toBe(true);
    expect(publishesOnlyForShape({ ...SHAPE, pending: WAITING.pending })).toBe(false);
    expect(publishesOnlyForShape({ ...SHAPE, eventChanged: EVENT_CHANGED.eventChanged })).toBe(false);
    expect(publishesOnlyForShape(NOTHING)).toBe(false);
  });
});

describe('milestoneMarkFor', () => {
  test('a published row waiting for 「いま公開する」 is 公開待ち, and 公開 once nothing is', () => {
    expect(milestoneMarkFor('published', 3, WAITING)).toEqual({ label: '公開待ち', tone: 'waiting' });
    expect(milestoneMarkFor('published', 3, NOTHING)).toEqual({ label: '公開', tone: 'published' });
  });

  test('a published row is not called 公開 when the waiting list could not be read', () => {
    expect(milestoneMarkFor('published', 3, null)).toEqual({ label: '公開（未確認）', tone: 'unknown' });
  });

  test('a draft stays 下書き even while its withdrawal is waiting', () => {
    const withdrawing: MilestonesPending = { ...NOTHING, pending: [{ milestoneId: 3, latestAction: 'withdraw' }] };

    expect(milestoneMarkFor('draft', 3, withdrawing)).toEqual({ label: '下書き', tone: 'draft' });
  });
});
