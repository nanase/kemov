import { AdminApiError } from '@/admin/lib/api';
import {
  canPublishFootprints,
  footprintsAnswerFor,
  isChangedSincePublish,
  type FootprintsPending,
} from '@/admin/lib/footprints-publish';

const NOTHING: FootprintsPending = { pending: [], changed: [], behind: false, outdated: false };
const WAITING: FootprintsPending = {
  pending: [{ eventId: 3, latestAction: 'publish' }],
  changed: [],
  behind: false,
  outdated: false,
};
const CHANGED: FootprintsPending = {
  pending: [],
  changed: [{ eventId: 5, title: '変わった行' }],
  behind: false,
  outdated: false,
};

describe('isChangedSincePublish', () => {
  test('is true only for a listed event', () => {
    expect(isChangedSincePublish(CHANGED, 5)).toBe(true);
    expect(isChangedSincePublish(CHANGED, 6)).toBe(false);
    expect(isChangedSincePublish(null, 5)).toBe(false);
  });
});

// 「本番に反映」 above the list reads the same list the worker's own
// publish does: what one calls waiting the other must call waiting too.
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

  // Nothing waits, but the JSON may say what no revision says: 「いま公開する」
  // is what builds it again from the revisions.
  test('is true when the public JSON may be behind, with nothing waiting', () => {
    expect(canPublishFootprints({ ...NOTHING, behind: true })).toBe(true);
  });

  // A whitelist changed since the JSON was written: 「いま公開する」 judges its
  // sources again (#282).
  test('is true when the public JSON is outdated, with nothing waiting', () => {
    expect(canPublishFootprints({ ...NOTHING, outdated: true })).toBe(true);
  });
});

const PROBLEMS = [
  { field: 'leadChannelIds', message: 'デビューの出来事は、主役を 1 人以上選んでください。' },
  { field: 'videoId', message: '動画 ID は 11 文字です。いまは 10 文字です。' },
];

describe('footprintsAnswerFor', () => {
  // #277's decision 1c.
  test.each([
    ['publish', 'draft', '公開しました'],
    ['save', 'published', '保存して本番に反映しました'],
    ['save', 'draft', '下書きを保存しました'],
    ['save', null, '下書きを保存しました'],
    ['withdraw', 'published', '非公開に戻しました'],
  ] as const)('a %s that went through on a %s row says so in a toast', (action, status, toast) => {
    expect(footprintsAnswerFor(action, status, null)).toEqual({ kind: 'done', toast });
  });

  // 1d: the reasons are the worker's, listed as they came.
  test('a draft refused for publishing lists the reasons, marks their fields and says what was typed was kept', () => {
    const error = new AdminApiError(400, { errors: [], problems: PROBLEMS, saved: true });

    expect(footprintsAnswerFor('publish', 'draft', error)).toEqual({
      kind: 'band',
      band: {
        title: '公開できません',
        lines: PROBLEMS.map((p) => p.message),
        note: '下書きとして保存しました',
      },
      fields: ['leadChannelIds', 'videoId'],
      changed: true,
    });
  });

  test('a published row whose save was refused says the row and the public site are as they were', () => {
    const error = new AdminApiError(400, { errors: [], problems: PROBLEMS, saved: false });

    expect(footprintsAnswerFor('save', 'published', error)).toEqual({
      kind: 'band',
      band: {
        title: '保存できません',
        lines: PROBLEMS.map((p) => p.message),
        note: '本番は変更前の内容のままです',
      },
      fields: ['leadChannelIds', 'videoId'],
      changed: false,
    });
  });

  // A draft stays a draft when the JSON cannot be written, so 「公開」 is the
  // button to press again; a published row's is 「保存」.
  test.each([
    ['publish', 'draft', '保存しましたが本番への反映に失敗しました'],
    ['save', 'published', '保存しましたが本番への反映に失敗しました'],
  ] as const)('a %s on a %s row that saved but could not reach the public site says so', (action, status, title) => {
    const error = new AdminApiError(502, { error: 'saved, but …', saved: true, event: null });

    expect(footprintsAnswerFor(action, status, error)).toEqual({
      kind: 'band',
      band: { title, lines: [], note: null },
      fields: [],
      changed: true,
    });
  });

  // Recorded as published before the JSON could be brought up to date: the
  // row shows 「保存」 now, whatever it was when 「公開」 was pressed.
  test('a publish that saved the row as published asks for 「保存」 again', () => {
    const error = new AdminApiError(502, { error: 'saved, but …', saved: true, event: { status: 'published' } });

    expect(footprintsAnswerFor('publish', 'draft', error)).toEqual({
      kind: 'band',
      band: {
        title: '保存しましたが本番への反映に失敗しました',
        lines: [],
        note: null,
      },
      fields: [],
      changed: true,
    });
  });

  test('a publish whose row stayed a draft asks for 「公開」 again', () => {
    const error = new AdminApiError(502, { error: 'saved, but …', saved: true, event: { status: 'draft' } });

    expect(footprintsAnswerFor('publish', 'draft', error)).toMatchObject({
      band: { title: '保存しましたが本番への反映に失敗しました' },
    });
  });

  test('a withdraw that made the row a draft but may not have reached the public site says how it gets out', () => {
    const error = new AdminApiError(502, { error: 'saved, but …', saved: true, event: { status: 'draft' } });

    expect(footprintsAnswerFor('withdraw', 'published', error)).toEqual({
      kind: 'band',
      band: {
        title: '本番への反映に失敗しました',
        lines: [],
        note: null,
      },
      fields: [],
      changed: true,
    });
  });

  test('a withdraw that could not reach the public site says nothing changed', () => {
    const error = new AdminApiError(502, { error: 'footprints/events.json could not be written' });

    expect(footprintsAnswerFor('withdraw', 'published', error)).toEqual({
      kind: 'band',
      band: {
        title: '非公開に戻せません',
        lines: [],
        note: '行は公開中のままです',
      },
      fields: [],
      changed: false,
    });
  });

  test('a save the schema refused says what the worker said, and marks the field it names', () => {
    const error = new AdminApiError(400, { error: 'startDate must be YYYY-MM-DD' });

    expect(footprintsAnswerFor('save', 'draft', error)).toEqual({
      kind: 'band',
      band: { title: '保存できません', lines: [], note: 'startDate must be YYYY-MM-DD' },
      fields: ['startDate'],
      changed: false,
    });
  });

  // A 502 without `saved` did not say it saved anything, so it is not called
  // a save - but a 5xx may have written part of the way, so the table is read again.
  test('a 502 that does not say it saved is a failure, not a save, and the table is read again', () => {
    const error = new AdminApiError(502, { error: 'bad gateway' });

    expect(footprintsAnswerFor('publish', 'draft', error)).toMatchObject({
      kind: 'band',
      band: { title: '保存できません', note: 'bad gateway' },
      changed: true,
    });
  });

  // The row is not what the screen shows: deleted, or withdrawn, elsewhere.
  test.each([404, 409, 500])('a %i reads the table again', (status) => {
    const error = new AdminApiError(status, { error: 'nope' });

    expect(footprintsAnswerFor('withdraw', 'published', error)).toMatchObject({ kind: 'band', changed: true });
  });

  test('a request that could not be sent at all is a failure', () => {
    expect(footprintsAnswerFor('save', 'draft', new TypeError('offline'))).toMatchObject({
      kind: 'band',
      band: { title: '保存できません', note: 'offline' },
      changed: false,
    });
  });
});

// 削除 is answered as 削除, not as a save: a 409 for a row published elsewhere
// says so under its own heading.
describe('footprintsAnswerFor on 削除', () => {
  test('says it was deleted', () => {
    expect(footprintsAnswerFor('delete', 'draft', null)).toEqual({ kind: 'done', toast: '削除しました' });
  });

  test('a refused delete is headed 削除できません, and the table is read again', () => {
    const error = new AdminApiError(409, { error: 'a published event cannot be deleted' });

    expect(footprintsAnswerFor('delete', 'draft', error)).toMatchObject({
      kind: 'band',
      band: { title: '削除できません', note: 'a published event cannot be deleted' },
      changed: true,
    });
  });
});

// The worker's 502 when the row changed under the request and the JSON it
// had written could not be built again without the change (#299).
describe('footprintsAnswerFor for a 502 that saved nothing', () => {
  const error = new AdminApiError(502, { error: 'footprints event 3 changed while …', saved: false });

  test('says the public timeline was not mended, in place of the worker message', () => {
    expect(footprintsAnswerFor('save', 'published', error)).toEqual({
      kind: 'band',
      band: { title: '保存できません', lines: [], note: '本番の年表への反映に失敗しました' },
      fields: [],
      changed: true,
    });
  });

  test('says the same for a withdraw, under its own title', () => {
    expect(footprintsAnswerFor('withdraw', 'published', error)).toEqual({
      kind: 'band',
      band: { title: '非公開に戻せません', lines: [], note: '本番の年表への反映に失敗しました' },
      fields: [],
      changed: true,
    });
  });
});
