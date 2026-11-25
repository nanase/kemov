import { AdminApiError } from '@/admin/lib/api';
import { SAVE_TOAST } from '@/admin/lib/editing';
import {
  canPublishGenet,
  entityLabel,
  isChangedSincePublish,
  publishesOnlyForShape,
  STREAM_NOTE_ID,
  streamAnswerFor,
  streamBandReasonIds,
  streamReasonId,
  tuneAnswerFor,
  tuneBandReasonIds,
  TUNE_NOTE_ID,
  tuneReasonId,
  TUNE_TEXT,
  type ChangedGenetEntry,
  type PendingGenetEntry,
} from '@/admin/lib/genet-publish';
import { PUBLISH_TEXT } from '@/admin/lib/publishing';

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
    expect(canPublishGenet({ pending: [], changed: [], shapeOutdated: false, behind: false })).toBe(false);
  });

  test('is true when something is waiting', () => {
    expect(canPublishGenet({ pending: [WAITING], changed: [], shapeOutdated: false, behind: false })).toBe(true);
  });

  // A row changed after it was published has no revision newer than the last
  // run, so the worker answers 'nothing to publish' (#201).
  test('is false when something only changed after it was published', () => {
    expect(canPublishGenet({ pending: [], changed: [CHANGED], shapeOutdated: false, behind: false })).toBe(false);
  });

  // Nothing waiting and nothing changed, but the stored JSON is in an older
  // shape: the worker would build it again, so the screen must let it be asked for.
  test('is true when only the stored shape is out of date', () => {
    expect(canPublishGenet({ pending: [], changed: [], shapeOutdated: true, behind: false })).toBe(true);
  });

  test('is false when the response does not report the shape at all', () => {
    expect(canPublishGenet({ pending: [], changed: [], behind: false })).toBe(false);
  });

  // A write of the JSON that no check found up to date may have left it
  // saying what no revision says; the worker builds it again for that.
  test('is true when the JSON may be behind', () => {
    expect(canPublishGenet({ pending: [], changed: [], shapeOutdated: false, behind: true })).toBe(true);
  });
});

describe('publishesOnlyForShape', () => {
  test('is true when the shape is the only reason', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [], shapeOutdated: true, behind: false })).toBe(true);
  });

  test('is false when something is waiting, even if the shape is out of date too', () => {
    expect(publishesOnlyForShape({ pending: [WAITING], changed: [], shapeOutdated: true, behind: false })).toBe(false);
  });

  test('is true when a row changed but nothing is waiting, since the build ignores what changed', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [CHANGED], shapeOutdated: true, behind: false })).toBe(true);
  });

  test('is false when the shape is current or not reported', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [], shapeOutdated: false, behind: false })).toBe(false);
    expect(publishesOnlyForShape({ pending: [], changed: [], behind: false })).toBe(false);
  });

  test('is false when the JSON may be behind too', () => {
    expect(publishesOnlyForShape({ pending: [], changed: [], shapeOutdated: true, behind: true })).toBe(false);
  });
});

describe('isChangedSincePublish', () => {
  test('matches on the entity and the key together', () => {
    const state = { pending: [], changed: [CHANGED], behind: false };

    expect(isChangedSincePublish(state, 'genet_tune', '1')).toBe(true);
    expect(isChangedSincePublish(state, 'genet_stream', '1')).toBe(false);
    expect(isChangedSincePublish(null, 'genet_tune', '1')).toBe(false);
  });
});

const PROBLEMS = [
  { field: 'title', performanceIndex: null, message: 'タイトルを書いてください。' },
  {
    field: 'performances',
    performanceIndex: 1,
    message: '2 曲目の場面 1 の動画 ID は 11 文字です。いまは 3 文字です。',
  },
];

describe('streamAnswerFor', () => {
  test.each([
    ['publish', 'draft', SAVE_TOAST.publish],
    ['save', 'published', SAVE_TOAST.savePublished],
    ['save', 'draft', SAVE_TOAST.saveDraft],
    ['withdraw', 'published', SAVE_TOAST.withdraw],
  ] as const)('%s on a %s stream that went through says %s', (action, status, toast) => {
    expect(streamAnswerFor(action, status, null)).toEqual({ kind: 'done', toast });
  });

  test('a refused publish lists the reasons, marks their parts, and says the draft was saved', () => {
    const error = new AdminApiError(400, { errors: [], problems: PROBLEMS, saved: true });

    expect(streamAnswerFor('publish', 'draft', error)).toEqual({
      kind: 'band',
      band: {
        title: PUBLISH_TEXT.refusedPublish,
        lines: PROBLEMS.map((p) => p.message),
        note: PUBLISH_TEXT.refusedPublishNote,
      },
      fields: [
        { section: 'title', performanceIndex: null, sceneIndex: null },
        { section: 'performances', performanceIndex: 1, sceneIndex: null },
      ],
      changed: true,
    });
  });

  test('a refused save of a published stream says nothing was saved, and reads nothing again', () => {
    const error = new AdminApiError(400, { errors: [], problems: PROBLEMS, saved: false });
    const answer = streamAnswerFor('save', 'published', error);

    expect(answer.kind === 'band' && [answer.band.title, answer.band.note, answer.changed]).toEqual([
      PUBLISH_TEXT.refusedSave,
      PUBLISH_TEXT.refusedSaveNote,
      false,
    ]);
  });

  // The button to press again is the one the stream shows now, by the status the answer gives it.
  test.each([
    ['draft', PUBLISH_TEXT.notWrittenPublish],
    ['published', PUBLISH_TEXT.notWrittenSave],
  ])('a 502 that saved a stream now %s says to press its button again', (status, title) => {
    const error = new AdminApiError(502, { error: 'saved, but …', saved: true, stream: { status } });

    expect(streamAnswerFor('publish', 'draft', error)).toEqual({
      kind: 'band',
      band: { title, lines: [], note: null },
      fields: [],
      changed: true,
    });
  });

  test('a withdraw the JSON could not follow says so, and one that changed nothing says that', () => {
    const behind = streamAnswerFor('withdraw', 'published', new AdminApiError(502, { error: '…', saved: true }));
    const nothing = streamAnswerFor('withdraw', 'published', new AdminApiError(502, { error: '…' }));

    expect(behind.kind === 'band' && [behind.band.title, behind.changed]).toEqual([PUBLISH_TEXT.withdrawnBehind, true]);
    expect(nothing.kind === 'band' && [nothing.band.title, nothing.changed]).toEqual([
      PUBLISH_TEXT.notWithdrawn,
      false,
    ]);
  });

  test('any other failure is said as it came, with the field it names, and a 409 reads the list again', () => {
    const answer = streamAnswerFor('save', 'draft', new AdminApiError(409, { error: 'stream abc already exists' }));

    expect(answer).toEqual({
      kind: 'band',
      band: { title: PUBLISH_TEXT.failed, lines: [], note: 'stream abc already exists' },
      fields: [{ section: 'videoId', performanceIndex: null, sceneIndex: null }],
      changed: true,
    });
  });

  test('a delete that failed says 削除できません, and reads the list again on a 409', () => {
    const answer = streamAnswerFor('delete', 'draft', new AdminApiError(409, { error: 'withdraw this stream first' }));

    expect(answer.kind === 'band' && [answer.band.title, answer.changed]).toEqual([PUBLISH_TEXT.removeFailed, true]);
  });

  test('a 400 save error changes nothing', () => {
    const answer = streamAnswerFor('save', 'draft', new AdminApiError(400, { error: 'title must be a string' }));

    expect(answer.kind === 'band' && answer.changed).toBe(false);
  });
});

describe('tuneAnswerFor', () => {
  test('a save that reached the public JSON says so, and one that did not says saved', () => {
    expect(tuneAnswerFor(true, null)).toEqual({ kind: 'done', toast: SAVE_TOAST.savePublished });
    expect(tuneAnswerFor(false, null)).toEqual({ kind: 'done', toast: SAVE_TOAST.saved });
  });

  test('a refusal lists the reasons, marks the attributes, and says nothing was saved', () => {
    const problems = [{ field: 'attributes', attributeIndex: 2, message: '作曲・作詞などの 3 番目に…' }];
    const answer = tuneAnswerFor(false, new AdminApiError(400, { errors: [], problems, saved: false }));

    expect(answer).toEqual({
      kind: 'band',
      band: { title: TUNE_TEXT.failed, lines: ['作曲・作詞などの 3 番目に…'], note: TUNE_TEXT.refusedNote },
      fields: [{ section: 'attributes', index: 2 }],
      changed: false,
    });
  });

  test('a 502 that saved says to press この曲を保存 again', () => {
    const answer = tuneAnswerFor(false, new AdminApiError(502, { error: '…', saved: true }));

    expect(answer.kind === 'band' && [answer.band.title, answer.changed]).toEqual([TUNE_TEXT.notWritten, true]);
  });

  test('any other failure keeps the tune band title, with the message as the note', () => {
    const answer = tuneAnswerFor(false, new AdminApiError(400, { error: 'title must not be empty' }));

    expect(answer).toEqual({
      kind: 'band',
      band: { title: TUNE_TEXT.failed, lines: [], note: 'title must not be empty' },
      fields: [{ section: 'title', index: null }],
      changed: false,
    });
  });
});

describe('streamBandReasonIds and tuneBandReasonIds', () => {
  const band = { title: '公開できません', lines: ['a', 'b'], note: 'note' };

  test("name the stream's reasons and the open tune's apart", () => {
    expect(
      streamBandReasonIds(
        band,
        [
          { section: 'title', performanceIndex: null, sceneIndex: null },
          { section: 'performances', performanceIndex: 1, sceneIndex: null },
        ],
        (f) => f.section === 'performances',
      ),
    ).toEqual(streamReasonId(1));
    expect(
      tuneBandReasonIds(
        { ...band, lines: [] },
        [{ section: 'attributes', index: 0 }],
        (f) => f.section === 'attributes',
      ),
    ).toEqual(TUNE_NOTE_ID);
    expect(streamReasonId(0)).not.toEqual(tuneReasonId(0));
    expect(STREAM_NOTE_ID).not.toEqual(TUNE_NOTE_ID);
  });
});
