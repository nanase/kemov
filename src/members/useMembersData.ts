import { computed, ref, type Ref } from 'vue';

import { getChannels, getMonths, getVideosTable, type ApiError } from '@/lib/api';
import { useIntervalAction } from '@/lib/useIntervalAction';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel, MonthsSeries, VideoTable } from '@/type/api';

/**
 * The three endpoints the member page reads, and how often it asks again.
 *
 * `GET /api/videos/table` is the whole public archive in one response, which
 * is what #144 built it for: the list's ranking, the heatmap, the shape of a
 * week and the four distributions are all the same rows read differently, and
 * asking the worker for each combination of member, kind and period would be
 * dozens of requests for data the browser already has.
 *
 * A failure keeps the last answer on screen. Emptying the page would say
 * "there is nothing", which is not what happened.
 */

/** How often the collector writes, which is what sets the faster rhythm. */
const COUNTS_SECONDS = 300;

/** The archive, which only changes as a stream ends or a video is published. */
const ARCHIVE_SECONDS = 1800;

/** How long to wait after a failure before asking again. */
const RETRY_SECONDS = 600;

export interface MembersData {
  channels: Ref<Channel[]>;
  months: Ref<MonthsSeries | null>;
  rows: Ref<VideoTableRow[]>;
  /** When the counts were read, as the API reports it. */
  countsFetchedAt: Ref<number | null>;
  /** True until the first round of each rhythm is over, answered or not. */
  loading: Ref<boolean>;
  /** The last failure, or null once something arrived again. */
  failure: Ref<ApiError | null>;
  /**
   * The endpoints that have never answered.
   *
   * One request failing while another succeeds is the case worth naming: the
   * page can draw a board without the monthly panel, and an empty panel would
   * say "nothing was published" where the truth is "nothing was read".
   */
  missing: Ref<{ table: boolean; months: boolean }>;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * The columnar response as one object per video.
 *
 * Every column is the same length - `readVideoTable` refuses a response where
 * they are not - so the index is the video and nothing here has to guard
 * against a column running short.
 */
export function tableRows(table: VideoTable): VideoTableRow[] {
  const { columns } = table;

  return columns.videoId.map((videoId, index) => ({
    videoId,
    channelId: columns.channelId[index]!,
    title: columns.title[index]!,
    type: columns.type[index]!,
    publishedAt: columns.publishedAt[index]!,
    actualStartTime: columns.actualStartTime[index]!,
    actualEndTime: columns.actualEndTime[index]!,
    durationSeconds: columns.durationSeconds[index]!,
    viewCount: columns.viewCount[index]!,
    likeCount: columns.likeCount[index]!,
    commentCount: columns.commentCount[index]!,
    chatMessageCount: columns.chatMessageCount[index]!,
    chatUniqueUserCount: columns.chatUniqueUserCount[index]!,
  }));
}

export function useMembersData(): MembersData {
  const channels = ref<Channel[]>([]);
  const months = ref<MonthsSeries | null>(null);
  const rows = ref<VideoTableRow[]>([]);
  const countsFetchedAt = ref<number | null>(null);
  const countsAsked = ref(false);
  const archiveAsked = ref(false);
  const tableRead = ref(false);
  const monthsRead = ref(false);

  /** The first endpoint that refused, once the ones that answered are in hand. */
  const refusal = (results: readonly PromiseSettledResult<unknown>[]) =>
    results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

  const counts = useIntervalAction(
    COUNTS_SECONDS * 1000,
    async () => {
      try {
        const channelList = await getChannels();

        channels.value = channelList.data.channels;
        countsFetchedAt.value = channelList.data.fetchedAt?.valueOf() ?? null;

        return COUNTS_SECONDS * 1000;
      } finally {
        // Asked, not answered. Without this a first failure leaves the page
        // saying "読み込んでいます" until a retry succeeds, which could be ten
        // minutes of a screen that is not loading anything.
        countsAsked.value = true;
      }
    },
    async () => RETRY_SECONDS * 1000,
  );

  const archive = useIntervalAction(
    ARCHIVE_SECONDS * 1000,
    async () => {
      // Asked together but kept apart: the board can be drawn from the table
      // alone, and the monthly panel from the months alone.
      const [table, monthsSeries] = await Promise.allSettled([getVideosTable(), getMonths()]);

      if (table.status === 'fulfilled') {
        rows.value = tableRows(table.value.data);
        tableRead.value = true;
      }

      if (monthsSeries.status === 'fulfilled') {
        months.value = monthsSeries.value.data;
        monthsRead.value = true;
      }

      archiveAsked.value = true;

      const failed = refusal([table, monthsSeries]);

      if (failed !== undefined) throw failed.reason;

      return ARCHIVE_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const failureOf = (error: unknown): ApiError | null => (error === undefined ? null : (error as ApiError));

  return {
    channels,
    months,
    rows,
    countsFetchedAt,
    loading: computed(() => !countsAsked.value || !archiveAsked.value) as Ref<boolean>,
    missing: computed(() => ({ table: !tableRead.value, months: !monthsRead.value })) as Ref<{
      table: boolean;
      months: boolean;
    }>,
    failure: computed(() => failureOf(counts.error.value) ?? failureOf(archive.error.value)) as Ref<ApiError | null>,
    start: async () => {
      await Promise.all([counts.start(), archive.start()]);
    },
    stop: () => {
      counts.stop();
      archive.stop();
    },
  };
}
