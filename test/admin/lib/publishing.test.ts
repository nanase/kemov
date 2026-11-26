import { AdminApiError } from '@/admin/lib/api';
import {
  bandReasonIds,
  bandReasonIdsWhere,
  liveMarkFor,
  publishAnswerFor,
  publishFootFor,
} from '@/admin/lib/publishing';

// #277's decision 1a: the chip is the row's status, and nothing else - every
// publish reaches the public site in the same request (#281, #283).
describe('liveMarkFor', () => {
  test('a published row is 公開中', () => {
    expect(liveMarkFor('published')).toEqual({ label: '公開中', tone: 'published' });
  });

  test('anything else is 下書き', () => {
    expect(liveMarkFor('draft')).toEqual({ label: '下書き', tone: 'draft' });
    expect(liveMarkFor('review')).toEqual({ label: '下書き', tone: 'draft' });
  });
});

describe('publishFootFor', () => {
  // #277's decision 1a: 公開 is the primary button of a draft.
  test('a draft offers 公開 first and 保存, with 削除 enabled', () => {
    expect(publishFootFor('draft')).toEqual({
      actions: [
        { action: 'publish', label: '公開' },
        { action: 'save', label: '保存' },
      ],
      deleteDisabled: false,
      deleteReason: null,
    });
  });

  // A row left `review` by a database the migration has not reached yet is still a draft.
  test('anything not published is offered what a draft is', () => {
    expect(publishFootFor('review')).toEqual(publishFootFor('draft'));
  });

  // 1a and 6-9: 削除 says why it cannot be pressed.
  test('a published row offers 保存 first and 非公開に戻す, with 削除 disabled and why', () => {
    expect(publishFootFor('published')).toEqual({
      actions: [
        { action: 'save', label: '保存' },
        { action: 'withdraw', label: '非公開に戻す' },
      ],
      deleteDisabled: true,
      deleteReason: '公開中は削除できません',
    });
  });
});

describe('bandReasonIds', () => {
  const refusal = {
    title: '公開できません',
    lines: ['タイトルを書いてください。', '出典が足りません。', '別の理由'],
    note: null,
  };

  test('points a field at every reason the refusal lists for it', () => {
    expect(bandReasonIds(refusal, ['title', 'sources', 'title'], 'title')).toEqual('foot-reason-0 foot-reason-2');
    expect(bandReasonIds(refusal, ['title', 'sources', 'title'], 'sources')).toEqual('foot-reason-1');
  });

  test('points a field the band does not mark at nothing', () => {
    expect(bandReasonIds(refusal, ['title', 'sources', 'title'], 'videoId')).toBeUndefined();
    expect(bandReasonIds(null, [], 'title')).toBeUndefined();
  });

  test('points a field marked by a band with no list at its note', () => {
    const failed = { title: '保存できません', lines: [], note: 'startDate must be YYYY-MM-DD' };

    expect(bandReasonIds(failed, ['startDate'], 'startDate')).toEqual('foot-band-note');
    expect(bandReasonIds({ ...failed, note: null }, ['startDate'], 'startDate')).toBeUndefined();
  });
});

describe('bandReasonIdsWhere', () => {
  const refusal = { title: '公開できません', lines: ['a', 'b', 'c'], note: 'note' };
  const fields = [{ at: 1 }, { at: 2 }, { at: 1 }];
  const ids = { reasonId: (index: number) => `r-${index}`, noteId: 'n' };

  test('points the fields `matches` picks at their reasons, by the ids it is given', () => {
    expect(bandReasonIdsWhere(refusal, fields, (f) => f.at === 1, ids)).toEqual('r-0 r-2');
  });

  test('points them at the note when the band lists no reason for each', () => {
    expect(bandReasonIdsWhere({ ...refusal, lines: [] }, [{ at: 1 }], (f) => f.at === 1, ids)).toEqual('n');
  });

  test('points at nothing when nothing is picked, or there is no band', () => {
    expect(bandReasonIdsWhere(refusal, fields, (f) => f.at === 3, ids)).toBeUndefined();
    expect(bandReasonIdsWhere(null, fields, (f) => f.at === 1, ids)).toBeUndefined();
  });
});

describe('publishAnswerFor', () => {
  test("marks a refusal's reasons by the shape's `fieldOfProblem` when it has one", () => {
    const problems = [{ field: 'performances', at: 3, message: '3 曲目の…' }];
    const answer = publishAnswerFor(
      { rowKey: 'stream', fieldForSaveError: () => null, fieldOfProblem: (p) => ({ section: p.field, at: p.at }) },
      'publish',
      'draft',
      new AdminApiError(400, { errors: [], problems, saved: true }),
    );

    expect(answer.kind === 'band' && answer.fields).toEqual([{ section: 'performances', at: 3 }]);
  });

  // #291: the note is the worker's Japanese; the field is found from the
  // English detail, so two fields that share one sentence stay apart.
  test("finds the field from the worker's detail and shows its message", () => {
    const seen: string[] = [];
    const answer = publishAnswerFor(
      {
        rowKey: 'event',
        fieldForSaveError: (detail) => {
          seen.push(detail);
          return detail.startsWith('startDate') ? 'startDate' : null;
        },
      },
      'save',
      'draft',
      new AdminApiError(400, { error: '日付の形式が正しくありません', detail: 'startDate must be YYYY-MM-DD' }),
    );

    expect(seen).toEqual(['startDate must be YYYY-MM-DD']);
    expect(answer.kind === 'band' && [answer.band.note, answer.fields]).toEqual([
      '日付の形式が正しくありません',
      ['startDate'],
    ]);
  });
});

// #299: a 409 for a row another screen changed says so in the screen's own
// words, for every data that answers through `publishAnswerFor`.
describe('publishAnswerFor for a 409 the worker marks changedElsewhere', () => {
  const shape = { rowKey: 'event', fieldForSaveError: () => null };
  const error = (message: string) => new AdminApiError(409, { error: message, changedElsewhere: true });

  test.each(['publish', 'save', 'withdraw'] as const)(
    'says 保存できませんでした for %s, and reads the row again',
    (action) => {
      const answer = publishAnswerFor(shape, action, 'published', error('footprints event 2 changed while …'));

      expect(answer.kind === 'band' && [answer.band.note, answer.changed]).toEqual([
        '別の画面で変更されたため保存できませんでした',
        true,
      ]);
    },
  );

  test('says 削除できませんでした for a delete', () => {
    const answer = publishAnswerFor(shape, 'delete', 'draft', error('withdraw this event before deleting it'));

    expect(answer.kind === 'band' && [answer.band.title, answer.band.note]).toEqual([
      '削除できません',
      '別の画面で変更されたため削除できませんでした',
    ]);
  });
});
