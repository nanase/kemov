import { AdminApiError } from '@/admin/lib/api';
import {
  canPublishMilestones,
  isChangedSincePublish,
  isEventChanged,
  milestonesAnswerFor,
  publishesOnlyForShape,
  sourceCheckBody,
  sourceChipFor,
  type MilestonesPending,
} from '@/admin/lib/subscriber-milestones-publish';

const NOTHING: MilestonesPending = { pending: [], changed: [], eventChanged: [], shapeOutdated: false, behind: false };
const WAITING: MilestonesPending = { ...NOTHING, pending: [{ milestoneId: 3, latestAction: 'publish' }] };
const CHANGED: MilestonesPending = { ...NOTHING, changed: [{ milestoneId: 5 }] };
const EVENT_CHANGED: MilestonesPending = { ...NOTHING, eventChanged: [{ milestoneId: 6, eventId: 2 }] };
const SHAPE: MilestonesPending = { ...NOTHING, shapeOutdated: true };
const BEHIND: MilestonesPending = { ...NOTHING, behind: true };

describe('isChangedSincePublish and isEventChanged', () => {
  test('find only the listed milestone', () => {
    expect(isChangedSincePublish(CHANGED, 5)).toBe(true);
    expect(isChangedSincePublish(CHANGED, 6)).toBe(false);
    expect(isEventChanged(EVENT_CHANGED, 6)).toBe(true);
    expect(isEventChanged(EVENT_CHANGED, 5)).toBe(false);
  });

  test('answer no when the list could not be read', () => {
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

  test('is true with a milestone waiting, a linked event changed, an old shape or a JSON that may be behind', () => {
    expect(canPublishMilestones(WAITING)).toBe(true);
    expect(canPublishMilestones(EVENT_CHANGED)).toBe(true);
    expect(canPublishMilestones(SHAPE)).toBe(true);
    expect(canPublishMilestones(BEHIND)).toBe(true);
  });

  // Such a row has no revision newer than the last run until 「保存」 is
  // pressed again (#201).
  test('is false when a row has only changed since it was published', () => {
    expect(canPublishMilestones(CHANGED)).toBe(false);
  });
});

describe('publishesOnlyForShape', () => {
  test('is true only when the shape is the one reason', () => {
    expect(publishesOnlyForShape(SHAPE)).toBe(true);
    expect(publishesOnlyForShape({ ...SHAPE, pending: WAITING.pending })).toBe(false);
    expect(publishesOnlyForShape({ ...SHAPE, eventChanged: EVENT_CHANGED.eventChanged })).toBe(false);
    expect(publishesOnlyForShape({ ...SHAPE, behind: true })).toBe(false);
    expect(publishesOnlyForShape(NOTHING)).toBe(false);
  });
});

const SOURCES_PROBLEM = '出典が足りません。ホワイトリストの出典か、別のサイトの出典を足してください。';

// What lib/publishing.ts's `publishAnswerFor` does is tested through
// あしあと's; these are what differs for a milestone.
describe('milestonesAnswerFor', () => {
  test('marks the sources of a draft refused for them, and says what was typed was kept', () => {
    const error = new AdminApiError(400, {
      errors: [SOURCES_PROBLEM],
      problems: [{ field: 'sources', message: SOURCES_PROBLEM }],
      saved: true,
    });

    expect(milestonesAnswerFor('publish', 'draft', error)).toEqual({
      kind: 'band',
      band: { title: '公開できません', lines: [SOURCES_PROBLEM], note: '下書きとして保存しました' },
      fields: ['sources'],
      changed: true,
    });
  });

  // The row comes back as `milestone`, not `event`.
  test('reads the status the row has now from the milestone in a 502 that saved', () => {
    const error = new AdminApiError(502, { error: 'saved, but …', saved: true, milestone: { status: 'published' } });

    expect(milestonesAnswerFor('publish', 'draft', error)).toMatchObject({
      band: { title: '保存しましたが本番への反映に失敗しました' },
    });
  });

  // The worker's 502 when a published row was withdrawn under the save, and
  // the JSON the save wrote could not be built again without it.
  test('says the public site was not mended, in place of the worker message, for a 502 that saved nothing', () => {
    const error = new AdminApiError(502, { error: 'subscriber milestone 3 changed while …', saved: false });

    expect(milestonesAnswerFor('save', 'published', error)).toEqual({
      kind: 'band',
      band: { title: '保存できません', lines: [], note: '本番の登録者数の節目への反映に失敗しました' },
      fields: [],
      changed: true,
    });
  });

  test('says the same for a withdraw, under its own title, and reads the table again', () => {
    const error = new AdminApiError(502, { error: 'subscriber milestone 3 changed while …', saved: false });

    expect(milestonesAnswerFor('withdraw', 'published', error)).toEqual({
      kind: 'band',
      band: { title: '非公開に戻せません', lines: [], note: '本番の登録者数の節目への反映に失敗しました' },
      fields: [],
      changed: true,
    });
  });

  test("marks the field a save's own message names", () => {
    const error = new AdminApiError(400, { error: 'reachedDate must be YYYY-MM-DD' });

    expect(milestonesAnswerFor('save', 'draft', error)).toMatchObject({
      band: { title: '保存できません', note: 'reachedDate must be YYYY-MM-DD' },
      fields: ['reachedDate'],
    });
  });

  test.each([
    ['publish', 'draft', '公開しました'],
    ['save', 'published', '保存して本番に反映しました'],
    ['save', 'draft', '下書きを保存しました'],
    ['withdraw', 'published', '非公開に戻しました'],
  ] as const)('a %s that went through on a %s row says so in a toast', (action, status, toast) => {
    expect(milestonesAnswerFor(action, status, null)).toEqual({ kind: 'done', toast });
  });
});

// #277's 2a: the chips beside each source.
describe('sourceChipFor', () => {
  test('names a source that counts by itself in green', () => {
    expect(sourceChipFor({ kind: 'whitelist' })).toEqual({ label: 'ホワイトリスト', tone: 'published' });
    expect(sourceChipFor({ kind: 'own_video' })).toEqual({ label: '本人の動画', tone: 'published' });
  });

  test('names any other by its site, and a second one on that site as such', () => {
    expect(sourceChipFor({ kind: 'host', host: 'youtube.com', sameSite: false })).toEqual({
      label: 'youtube.com',
      tone: 'kind',
    });
    expect(sourceChipFor({ kind: 'host', host: 'youtube.com', sameSite: true })).toEqual({
      label: 'youtube.com（同じサイト）',
      tone: 'kind',
    });
  });

  test('says nothing about text no site can be read from', () => {
    expect(sourceChipFor({ kind: 'host', host: null, sameSite: false })).toBeNull();
  });
});

describe('sourceCheckBody', () => {
  test('sends the URLs as a save would, trimmed, and nothing but what the check reads', () => {
    const fields = {
      channelId: 'UCaaa',
      announcedBy: 'listener',
      sources: [
        { url: ' https://x.com/a ', title: '題' },
        { url: '', title: null },
      ],
    };

    expect(sourceCheckBody(fields)).toEqual({
      channelId: 'UCaaa',
      announcedBy: 'listener',
      urls: ['https://x.com/a', ''],
    });
  });
});
