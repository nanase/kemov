import type { EventFormFields } from '@/admin/lib/footprints';
import type { StreamFormFields } from '@/admin/lib/genet-streams';
import type { TuneFormFields } from '@/admin/lib/genet-tunes';
import {
  milestonesWithDraft,
  publicEventOf,
  publicMilestoneOf,
  publicSongOf,
  streamsWithDraft,
} from '@/admin/lib/preview-public';
import type { MilestoneFormFields } from '@/admin/lib/subscriber-milestones';
import type { GenetStream } from '@/lib/genet/musicTypes';
import type { SubscriberMilestone } from '@/type/api';

/** An あしあと panel's fields for a published event, with `overrides` on top. */
function eventFields(overrides: Partial<EventFormFields> = {}): EventFormFields {
  return {
    datePrecision: 'day',
    startDate: '2026-09-17',
    startsAt: null,
    endDate: null,
    kind: 'anniversary',
    emphasized: false,
    title: 'ウサコ4周年記念3D配信',
    place: 'YouTube（ウサギコウモリチャンネル）',
    supplement: null,
    videoId: 'kRcm24dPi44',
    sourcePending: false,
    memo: '公開されないメモ',
    channelIds: ['UCxm7yNjJsSvyvcG96-Cvmpw', 'UCnyE-wD1pE2GZOxA6OHjW9g'],
    sources: [{ url: 'https://www.youtube.com/watch?v=kRcm24dPi44', title: null }],
    ...overrides,
  };
}

describe('publicEventOf', () => {
  test('the event as the public timeline reads it', () => {
    const readout = publicEventOf(eventFields(), 184);

    expect(readout.ok).toBe(true);
    if (!readout.ok) return;
    expect(readout.value).toMatchObject({ eventId: 184, kind: 'anniversary', title: 'ウサコ4周年記念3D配信' });
    expect(readout.value).not.toHaveProperty('memo');
  });

  // The published JSON sorts them, and the card draws the faces in that order.
  test('the members come in channel id order, not the order they were picked', () => {
    const readout = publicEventOf(eventFields(), 184);

    expect(readout.ok && readout.value.channelIds).toEqual(['UCnyE-wD1pE2GZOxA6OHjW9g', 'UCxm7yNjJsSvyvcG96-Cvmpw']);
  });

  test('a date the page cannot read says which field', () => {
    const readout = publicEventOf(eventFields({ startDate: '2026-9-17' }), 184);

    expect(readout).toEqual({ ok: false, field: 'start_date' });
  });

  test('a kind the page does not know says which field', () => {
    expect(publicEventOf(eventFields({ kind: 'nonsense' }), 184)).toEqual({ ok: false, field: 'kind' });
  });
});

/** A milestone panel's fields, with `overrides` on top. */
function milestoneFields(overrides: Partial<MilestoneFormFields> = {}): MilestoneFormFields {
  return {
    channelId: 'UCMpw36mXEu3SLsqdrJxUKNA',
    datePrecision: 'day',
    reachedDate: '2024-01-30',
    subscriberCount: '20,000',
    announcedBy: 'member',
    eventId: null,
    memo: null,
    sources: [{ url: 'https://x.com/Shimahai_KEMOV/status/1', title: null }],
    ...overrides,
  };
}

describe('publicMilestoneOf', () => {
  test('the count is read with its separators', () => {
    const readout = publicMilestoneOf(milestoneFields(), 7, null);

    expect(readout.ok && readout.value.subscriberCount).toBe(20000);
  });

  test('a listener post is published without its sources', () => {
    const readout = publicMilestoneOf(milestoneFields({ announcedBy: 'listener' }), 7, null);

    expect(readout.ok && readout.value.sources).toEqual([]);
  });

  test('the linked event is carried by its title', () => {
    const event = { eventId: 40, title: '登録者 2 万人', startDate: '2024-01-30' };
    const readout = publicMilestoneOf(milestoneFields({ eventId: 40 }), 7, event);

    expect(readout.ok && readout.value.event).toEqual(event);
  });

  test('a count that is not a number says which field', () => {
    expect(publicMilestoneOf(milestoneFields({ subscriberCount: '2万' }), 7, null)).toEqual({
      ok: false,
      field: 'subscriber_count',
    });
  });
});

/** A published milestone of `milestoneId` × 1,000 subscribers. */
function published(
  milestoneId: number,
  reachedDate: string,
  channelId = 'UCMpw36mXEu3SLsqdrJxUKNA',
): SubscriberMilestone {
  return {
    milestoneId,
    channelId,
    datePrecision: 'day',
    reachedDate,
    subscriberCount: milestoneId * 1000,
    announcedBy: 'member',
    event: null,
    sources: [],
  };
}

describe('milestonesWithDraft', () => {
  const others = [published(1, '2021-07-01'), published(2, '2022-01-01'), published(9, '2021-08-01', 'UCother')];

  test('the draft takes the place of its published self, in date order', () => {
    const draft = { ...published(2, '2021-06-01'), subscriberCount: 500 };

    expect(milestonesWithDraft(others, draft).map((m) => [m.milestoneId, m.reachedDate])).toEqual([
      [2, '2021-06-01'],
      [1, '2021-07-01'],
    ]);
  });

  test('a new draft joins the member’s own milestones only', () => {
    const draft = published(-1, '2021-12-01');

    expect(milestonesWithDraft(others, draft).map((m) => m.milestoneId)).toEqual([1, -1, 2]);
  });
});

/** A tune panel's fields, with `overrides` on top. */
function tuneFields(overrides: Partial<TuneFormFields> = {}): TuneFormFields {
  return {
    title: '[くるみ割り人形](wiki:くるみ割り人形) 作品71a',
    originalTitle: 'Щелкунчик',
    subtunes: ['第1曲 小序曲'],
    attributes: [{ name: '作曲', text: null, people: [{ personId: 5, creditedAs: null, note: null }] }],
    videos: [{ videoId: 'aaaaaaaaaaa', title: 'The Nutcracker', startSeconds: null, description: null }],
    scores: [{ url: 'https://imslp.org/', title: 'IMSLP' }],
    memo: '公開されないメモ',
    ...overrides,
  };
}

/** A stream panel's fields performing tune 32, with `overrides` on top. */
function streamFields(overrides: Partial<StreamFormFields> = {}): StreamFormFields {
  return {
    platform: 'youtube',
    url: null,
    videoType: 'live',
    title: '【楽曲解説】くるみ割り人形',
    shortTitle: null,
    publishedAt: '2023-03-09T03:00:00Z',
    categories: ['楽曲解説'],
    keywords: [],
    memo: null,
    performances: [{ tuneId: 32, description: '[演奏](yt:gHVZb1UheTk?t=4925)', scenes: [] }],
    ...overrides,
  };
}

const PEOPLE = [{ personId: 5, name: 'ピョートル・チャイコフスキー', link: null, memo: 'メモ' }];

describe('publicSongOf', () => {
  test('the tune, the stream and the people as the public page reads them', () => {
    const readout = publicSongOf(tuneFields(), 32, streamFields(), 'gHVZb1UheTk', PEOPLE);

    expect(readout.ok).toBe(true);
    if (!readout.ok) return;
    expect(readout.value.tune).toMatchObject({ tune_id: 32, original_title: 'Щелкунчик' });
    expect(readout.value.tune).not.toHaveProperty('memo');
    expect(readout.value.tune.attributes[0]!.people).toEqual([{ person_id: 5, credited_as: null, note: null }]);
    expect(readout.value.stream).toMatchObject({ video_id: 'gHVZb1UheTk', published_at: '2023-03-09T03:00:00Z' });
    expect(readout.value.people).toEqual([{ person_id: 5, name: 'ピョートル・チャイコフスキー', link: null }]);
  });

  // The page reads the whole body at once: a bad date anywhere stops it.
  test('a date the page cannot read is named', () => {
    expect(publicSongOf(tuneFields(), 32, streamFields({ publishedAt: '2023-03-09' }), 'x', PEOPLE)).toEqual({
      ok: false,
      field: 'published_at',
    });
  });

  test('a scene second that is not a number is named', () => {
    const stream = streamFields({
      performances: [{ tuneId: 32, description: null, scenes: [{ style: 'play', videoId: 'x', startSeconds: NaN }] }],
    });

    expect(publicSongOf(tuneFields(), 32, stream, 'x', PEOPLE)).toEqual({ ok: false, field: 'start_seconds' });
  });
});

describe('streamsWithDraft', () => {
  const stream = (videoId: string, publishedAt: string, title = videoId): GenetStream => ({
    video_id: videoId,
    platform: 'youtube',
    url: null,
    video_type: 'live',
    title,
    short_title: null,
    published_at: publishedAt,
    categories: [],
    keywords: [],
    performances: [],
  });

  test('a new stream takes its place among the published ones, newest first', () => {
    const published = [stream('c', '2026-03-01T00:00:00Z'), stream('a', '2026-01-01T00:00:00Z')];

    expect(streamsWithDraft(published, stream('b', '2026-02-01T00:00:00Z')).map((s) => s.video_id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  test('a published stream is replaced by its draft, not listed twice', () => {
    const published = [stream('a', '2026-01-01T00:00:00Z', '前の題')];
    const merged = streamsWithDraft(published, stream('a', '2026-01-01T00:00:00Z', '新しい題'));

    expect(merged.map((s) => s.title)).toEqual(['新しい題']);
  });
});
