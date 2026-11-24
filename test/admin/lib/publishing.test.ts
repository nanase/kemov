import { bandReasonIds, liveMarkFor, publishFootFor } from '@/admin/lib/publishing';

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
      note: null,
      deleteDisabled: false,
      deleteReason: null,
    });
  });

  // A row left `review` by a database the migration has not reached yet is still a draft.
  test('anything not published is offered what a draft is', () => {
    expect(publishFootFor('review')).toEqual(publishFootFor('draft'));
  });

  // 1a and 6-9: the save reaches the public site, and 削除 says why it cannot be pressed.
  test('a published row offers 保存 first and 非公開に戻す, with 削除 disabled and why', () => {
    expect(publishFootFor('published')).toEqual({
      actions: [
        { action: 'save', label: '保存' },
        { action: 'withdraw', label: '非公開に戻す' },
      ],
      note: '保存するとすぐ本番に出ます',
      deleteDisabled: true,
      deleteReason: '公開中は削除できません。先に「非公開に戻す」を押してください。',
    });
  });
});

describe('bandReasonIds', () => {
  const refusal = {
    title: '公開できません',
    lines: ['題を書いてください。', '出典が足りません。', '別の理由'],
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
