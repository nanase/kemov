import type { FootprintsEvent } from '@/admin/lib/footprints';
import { pageTitle, SIDEBAR_GROUPS } from '@/admin/lib/sidebar';
import {
  ANNOUNCERS,
  announcerLabel,
  emptyFormFields,
  fieldForSaveError,
  formatCount,
  linkableEvents,
  milestoneButtonsFor,
  milestonesQuery,
  milestoneTitle,
  toFormFields,
  toRequestBody,
  type SubscriberMilestone,
} from '@/admin/lib/subscriber-milestones';

const MILESTONE: SubscriberMilestone = {
  milestoneId: 7,
  channelId: 'UCdummy',
  datePrecision: 'day',
  reachedDate: '2031-04-05',
  subscriberCount: 12345,
  announcedBy: 'member',
  eventId: 3,
  status: 'draft',
  memo: null,
  createdAt: '2031-04-06T00:00:00Z',
  updatedAt: '2031-04-06T00:00:00Z',
  sources: [{ url: 'https://example.com/a', title: null }],
};

describe('ANNOUNCERS', () => {
  test('has the three values worker/src/admin/subscriber-milestones.ts accepts, in its order', () => {
    expect(ANNOUNCERS.map((a) => a.value)).toEqual(['member', 'official', 'listener']);
  });

  test('announcerLabel falls back to the raw value for an unknown one', () => {
    expect(announcerLabel('listener')).toEqual('リスナー');
    expect(announcerLabel('nope')).toEqual('nope');
  });
});

describe('milestonesQuery', () => {
  test('is empty when nothing narrows the list', () => {
    expect(milestonesQuery('all', 'all')).toEqual('');
  });

  test('carries the member and the status the worker reads', () => {
    expect(milestonesQuery('UCdummy', 'all')).toEqual('?channelId=UCdummy');
    expect(milestonesQuery('all', 'published')).toEqual('?status=published');
    expect(milestonesQuery('UCdummy', 'draft')).toEqual('?channelId=UCdummy&status=draft');
  });
});

describe('toFormFields', () => {
  test('copies the sources, so editing the form leaves the row alone', () => {
    const fields = toFormFields(MILESTONE);

    fields.sources[0]!.url = 'https://example.com/b';

    expect(MILESTONE.sources[0]!.url).toEqual('https://example.com/a');
    expect(fields.subscriberCount).toEqual('12345');
  });
});

// Neither the date nor the count may start as a value that could be saved
// without anyone having typed it (#222).
describe('emptyFormFields', () => {
  test('starts with no date and no count', () => {
    const fields = emptyFormFields('UCdummy');

    expect(fields.channelId).toEqual('UCdummy');
    expect(fields.reachedDate).toEqual('');
    expect(fields.subscriberCount).toEqual('');
  });
});

describe('toRequestBody', () => {
  const base = toFormFields(MILESTONE);

  test('sends the count as a number, without thousands separators', () => {
    expect(toRequestBody({ ...base, subscriberCount: '20,000' }).subscriberCount).toEqual(20000);
    expect(toRequestBody({ ...base, subscriberCount: ' 5000 ' }).subscriberCount).toEqual(5000);
  });

  // The worker is what refuses a count, with its own reason. Reading "2万"
  // as 2 here would save a number nobody announced.
  test('sends a count it cannot read as it is, for the worker to refuse', () => {
    expect(toRequestBody({ ...base, subscriberCount: '2万' }).subscriberCount).toEqual('2万');
    expect(toRequestBody({ ...base, subscriberCount: '' }).subscriberCount).toEqual('');
    expect(toRequestBody({ ...base, subscriberCount: '1.5' }).subscriberCount).toEqual('1.5');
  });

  test('sends an empty memo and an empty source title as null', () => {
    const body = toRequestBody({ ...base, memo: '  ', sources: [{ url: ' https://example.com/c ', title: '' }] });

    expect(body.memo).toBeNull();
    expect(body.sources).toEqual([{ url: 'https://example.com/c', title: null }]);
  });
});

describe('formatCount and milestoneTitle', () => {
  test('write the count with separators', () => {
    expect(formatCount(12345)).toEqual('12,345');
    expect(milestoneTitle(MILESTONE, 'ダミー')).toEqual('ダミー 12,345 人（2031-04-05）');
  });
});

describe('linkableEvents', () => {
  test('keeps only the events of kind milestone', () => {
    const events = [
      { eventId: 1, kind: 'milestone' },
      { eventId: 2, kind: 'music' },
    ] as FootprintsEvent[];

    expect(linkableEvents(events).map((e) => e.eventId)).toEqual([1]);
  });
});

describe('fieldForSaveError', () => {
  test('marks the field a save message names', () => {
    expect(fieldForSaveError('reachedDate must be YYYY-MM-DD')).toEqual('reachedDate');
    expect(fieldForSaveError('subscriberCount must be an integer')).toEqual('subscriberCount');
    expect(fieldForSaveError('unknown channelId: UCx')).toEqual('channelId');
    expect(fieldForSaveError('every source url must start with https://')).toEqual('sources');
  });

  test('reads the publish check, which names no field', () => {
    expect(fieldForSaveError('there are no sources')).toEqual('sources');
    expect(fieldForSaveError('footprints event 3 is not a milestone')).toEqual('eventId');
  });

  // AdminApiError joins a publish's reasons with " / ".
  test('marks the first field named when several are', () => {
    expect(fieldForSaveError('there are no sources / footprints event 3 is not a milestone')).toEqual('sources');
    expect(fieldForSaveError('footprints event 3 is not a milestone / there are no sources')).toEqual('eventId');
  });

  test('is null for a message about no field', () => {
    expect(fieldForSaveError('withdraw this milestone before deleting it')).toBeNull();
  });
});

// The worker refuses to delete a published milestone (409), so the button is
// disabled until it is withdrawn.
describe('milestoneButtonsFor', () => {
  test('a draft can be sent to 公開待ち and deleted', () => {
    expect(milestoneButtonsFor('draft', null)).toEqual({
      publishLabel: '公開待ちにする',
      withdrawLabel: null,
      deleteDisabled: false,
    });
  });

  test('a published row can be withdrawn, not deleted, and is sent to 公開待ち again only once it changed', () => {
    expect(milestoneButtonsFor('published', false)).toEqual({
      publishLabel: null,
      withdrawLabel: '下書きに戻す',
      deleteDisabled: true,
    });
    expect(milestoneButtonsFor('published', true).publishLabel).toEqual('公開待ちにする');
    expect(milestoneButtonsFor('published', null).publishLabel).toEqual('公開待ちにする');
  });
});

describe('the sidebar', () => {
  test('lists 登録者数の節目 right after 統計', () => {
    const pages = SIDEBAR_GROUPS.find((g) => g.label === 'データ')!.items.map((i) => i.page);

    expect(pages.indexOf('subscribers')).toEqual(pages.indexOf('snaps') + 1);
    expect(pageTitle('subscribers')).toEqual('登録者数の節目');
  });
});
