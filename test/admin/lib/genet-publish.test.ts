import {
  canPublishGenet,
  entityLabel,
  publishesOnlyForShape,
  type ChangedGenetEntry,
  type PendingGenetEntry,
} from '@/admin/lib/genet-publish';

describe('entityLabel', () => {
  test.each([
    ['genet_stream', '配信'],
    ['genet_tune', '曲'],
    ['genet_person', '人'],
  ] as const)('labels %s as %s', (entity, label) => {
    expect(entityLabel(entity)).toEqual(label);
  });
});

const WAITING: PendingGenetEntry = {
  entity: 'genet_stream',
  key: 'abcdefghijk',
  revisionId: 1,
  latestAction: 'publish',
};
const CHANGED: ChangedGenetEntry = { entity: 'genet_tune', key: '1', title: '曲名' };

describe('canPublishGenet', () => {
  test('is false when nothing is waiting or changed and the shape is current', () => {
    expect(canPublishGenet({ pending: [], changed: [], shapeOutdated: false })).toBe(false);
  });

  test('is true when something is waiting', () => {
    expect(canPublishGenet({ pending: [WAITING], changed: [], shapeOutdated: false })).toBe(true);
  });

  test('is true when something changed after it was published', () => {
    expect(canPublishGenet({ pending: [], changed: [CHANGED], shapeOutdated: false })).toBe(true);
  });

  // Nothing waiting and nothing changed, but the stored JSON is in an older
  // shape: the worker would build it again, so the screen must let it be asked for.
  test('is true when only the stored shape is out of date', () => {
    expect(canPublishGenet({ pending: [], changed: [], shapeOutdated: true })).toBe(true);
  });

  test('is false when the response does not report the shape at all', () => {
    expect(canPublishGenet({ pending: [], changed: [] })).toBe(false);
  });
});

describe('publishesOnlyForShape', () => {
  test('is true when the shape is the only reason', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [], shapeOutdated: true })).toBe(true);
  });

  test('is false when something is waiting or changed, even if the shape is out of date too', () => {
    expect(publishesOnlyForShape({ pending: [WAITING], changed: [], shapeOutdated: true })).toBe(false);
    expect(publishesOnlyForShape({ pending: [], changed: [CHANGED], shapeOutdated: true })).toBe(false);
  });

  test('is false when the shape is current or not reported', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [], shapeOutdated: false })).toBe(false);
    expect(publishesOnlyForShape({ pending: [], changed: [] })).toBe(false);
  });
});
