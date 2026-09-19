import { computed, ref, type Ref } from 'vue';

import { getChannels, getVideosTable, type ApiError } from '@/lib/api';
import { useIntervalAction } from '@/lib/useIntervalAction';
import type { Channel } from '@/type/api';
import type { VideoTableRow } from '@/lib/ranking';
import { rowsFrom } from './model';

/**
 * The two endpoints #135's page reads, and how often it asks again.
 *
 * Split into two rhythms rather than one, the way `/stats/`'s
 * `useStatsData.ts` splits its own four: the channel list changes every
 * collection round, and the video table is the whole archive reshaped, which
 * moves only as streams finish. Asking for 6,000-plus rows every few minutes
 * would be redrawing the same ranking for nothing.
 *
 * A failure keeps the last answer on screen rather than emptying the page -
 * a blank ranking reads as "there is nothing", not as "this could not be
 * read".
 */

/** How often the collector writes, which is what sets the channel list's rhythm. */
const CHANNELS_SECONDS = 300;

/** The video table is the archive reshaped, which only changes as streams finish. */
const TABLE_SECONDS = 1800;

/** How long to wait after a failure before asking again. */
const RETRY_SECONDS = 600;

export interface VideosData {
  channels: Ref<Channel[]>;
  rows: Ref<VideoTableRow[]>;
  /**
   * When the channel list was read, as the API reports it.
   *
   * The badge and the three-step freshness read this one, not the video
   * table's own age: the channel list is what the collector refreshes on the
   * fast rhythm, so it is the one number that says how current the page is.
   */
  channelsFetchedAt: Ref<number | null>;
  /** When the video table was built, as the API reports it. */
  tableFetchedAt: Ref<number | null>;
  /** True until both endpoints have answered once. */
  loading: Ref<boolean>;
  /** The last failure, or null once something arrived again. */
  failure: Ref<ApiError | null>;
  start: () => Promise<void>;
  stop: () => void;
}

export function useVideosData(): VideosData {
  const channels = ref<Channel[]>([]);
  const rows = ref<VideoTableRow[]>([]);
  const channelsFetchedAt = ref<number | null>(null);
  const tableFetchedAt = ref<number | null>(null);
  const channelsArrived = ref(false);
  const tableArrived = ref(false);

  const channelsFetch = useIntervalAction(
    CHANNELS_SECONDS * 1000,
    async () => {
      const { data } = await getChannels();

      channels.value = data.channels;
      channelsFetchedAt.value = data.fetchedAt?.valueOf() ?? null;
      channelsArrived.value = true;

      return CHANNELS_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const tableFetch = useIntervalAction(
    TABLE_SECONDS * 1000,
    async () => {
      const { data } = await getVideosTable();

      rows.value = rowsFrom(data);
      tableFetchedAt.value = data.fetchedAt?.valueOf() ?? null;
      tableArrived.value = true;

      return TABLE_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const failureOf = (error: unknown): ApiError | null => (error === undefined ? null : (error as ApiError));

  return {
    channels,
    rows,
    channelsFetchedAt,
    tableFetchedAt,
    loading: computed(() => !channelsArrived.value || !tableArrived.value) as Ref<boolean>,
    failure: computed(
      () => failureOf(channelsFetch.error.value) ?? failureOf(tableFetch.error.value),
    ) as Ref<ApiError | null>,
    start: async () => {
      await Promise.all([channelsFetch.start(), tableFetch.start()]);
    },
    stop: () => {
      channelsFetch.stop();
      tableFetch.stop();
    },
  };
}
