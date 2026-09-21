import {
  canPublishGenet,
  canRepublishStream,
  entityLabel,
  isChangedSincePublish,
  isWaiting,
  publishesOnlyForShape,
  streamMarkFor,
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

  // A row changed after it was published has no revision newer than the last
  // run, so the worker answers 'nothing to publish' (#201).
  test('is false when something only changed after it was published', () => {
    expect(canPublishGenet({ pending: [], changed: [CHANGED], shapeOutdated: false })).toBe(false);
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

  test('is false when something is waiting, even if the shape is out of date too', () => {
    expect(publishesOnlyForShape({ pending: [WAITING], changed: [], shapeOutdated: true })).toBe(false);
  });

  test('is true when a row changed but nothing is waiting, since the build ignores what changed', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [CHANGED], shapeOutdated: true })).toBe(true);
  });

  test('is false when the shape is current or not reported', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [], shapeOutdated: false })).toBe(false);
    expect(publishesOnlyForShape({ pending: [], changed: [] })).toBe(false);
  });
});

describe('isWaiting', () => {
  const state = { pending: [WAITING], changed: [] };

  test('matches on the entity and the key together', () => {
    expect(isWaiting(state, 'genet_stream', 'abcdefghijk')).toBe(true);
    expect(isWaiting(state, 'genet_tune', 'abcdefghijk')).toBe(false);
    expect(isWaiting(state, 'genet_stream', 'other')).toBe(false);
  });

  test('is null, not false, when the list could not be read', () => {
    expect(isWaiting(null, 'genet_stream', 'abcdefghijk')).toBeNull();
  });
});

describe('isChangedSincePublish', () => {
  test('matches on the entity and the key together', () => {
    const state = { pending: [], changed: [CHANGED] };

    expect(isChangedSincePublish(state, 'genet_tune', '1')).toBe(true);
    expect(isChangedSincePublish(state, 'genet_stream', '1')).toBe(false);
    expect(isChangedSincePublish(null, 'genet_tune', '1')).toBe(false);
  });
});

describe('streamMarkFor', () => {
  test('a published stream waiting for 「いま公開する」 is 公開待ち, and 公開 after', () => {
    expect(streamMarkFor('published', 'abcdefghijk', { pending: [WAITING], changed: [] }).label).toEqual('公開待ち');
    expect(streamMarkFor('published', 'abcdefghijk', { pending: [], changed: [] }).label).toEqual('公開');
  });

  test('is 公開（未確認） when the list could not be read', () => {
    expect(streamMarkFor('published', 'abcdefghijk', null).label).toEqual('公開（未確認）');
  });
});

describe('canRepublishStream', () => {
  const streamChanged: ChangedGenetEntry = { entity: 'genet_stream', key: 'abcdefghijk', title: '配信題' };

  test('is true when this stream itself changed', () => {
    expect(canRepublishStream({ pending: [], changed: [streamChanged] }, 'abcdefghijk')).toBe(true);
  });

  // Another stream changing is no reason to offer a stream that did not change
  // a new version: it would match the last one.
  test('is false when only another stream changed', () => {
    expect(canRepublishStream({ pending: [], changed: [streamChanged] }, 'otherstream')).toBe(false);
  });

  // A tune or a person has no screen of its own to be sent to 公開待ち from;
  // publishing a stream that performs it is what does that, and which stream
  // that is cannot be told from here.
  test('is true while a tune or a person is changed, whichever stream it is asked about', () => {
    expect(canRepublishStream({ pending: [], changed: [CHANGED] }, 'otherstream')).toBe(true);
  });

  test('is false when nothing is changed', () => {
    expect(canRepublishStream({ pending: [WAITING], changed: [] }, 'abcdefghijk')).toBe(false);
  });

  test('is true when unknown, rather than leaving no way forward', () => {
    expect(canRepublishStream(null, 'abcdefghijk')).toBe(true);
  });
});
