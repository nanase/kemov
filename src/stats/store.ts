import { computed, ref } from 'vue';
import { computedAsync } from '@vueuse/core';
import { defineStore, storeToRefs } from 'pinia';
import dayjs, { type Dayjs } from '@nanase/alnilam/dayjs';
import { pick } from '@nanase/alnilam/object';

import { getAllVideos, getChannels, getLive, type ApiError, type Freshness, type VideoArchive } from '@/lib/api';
import { useIntervalAction } from '@/lib/useIntervalAction';
import type { Channel, LiveStream, Video } from '@/type/api';

/**
 * Everything the statistics pages read, from one API on one origin.
 *
 * What this replaces asked two hosts in turn - the channel list from one, the
 * statistics from another - and merged the answers. Either failing left the
 * table empty, so the site's own host going down took the statistics with it.
 * `GET /api/channels` answers both halves at once, which removes the failure
 * rather than handling it.
 *
 * The three things this deliberately does not do:
 *
 * - It does not treat a failure as an empty result. The old `catch { return
 *   [] }` around the video list made "could not be read" and "has no videos"
 *   the same answer.
 * - It does not treat a partial result as a whole one. A channel's archive is
 *   up to seven pages, and a page that failed halfway would quietly shrink
 *   every total on the detail page.
 * - It does not assume a response's shape. @/lib/api checks each one and
 *   throws where the field is, rather than letting a wrong body fail somewhere
 *   in a component.
 */

const NO_VIDEOS: VideoArchive = {
  videos: [],
  complete: false,
  freshness: { state: 'unknown', staleSeconds: 0 },
};

/** How often the collector writes, which is what sets the polling cadence. */
const COLLECTION_SECONDS = 600;

/** Never poll faster than this, however late the last reading looks. */
const MIN_POLL_SECONDS = 30;

/** How long to wait after a failure before asking again. */
const RETRY_SECONDS = 600;

const useStatsStore = defineStore('stats', () => {
  // states
  const channelId = ref<string>();
  const channels = ref<Channel[]>([]);
  const liveStreams = ref<readonly LiveStream[]>([]);
  const excludedFreeChats = ref<number>(0);
  const fetchedAt = ref<Dayjs>(dayjs(null));
  /** Where the channel list came from, and how old it is. */
  const freshness = ref<Freshness>({ state: 'unknown', staleSeconds: 0 });

  // getters
  const channel = computed<Channel | undefined>(() => channels.value.find((c) => c.channelId === channelId.value));
  const errorOccurred = computed<boolean>(
    () => fetching.channels.errorOccurred.value || fetching.live.errorOccurred.value,
  );

  const loadingVideos = ref<boolean>(false);
  const archive = computedAsync<VideoArchive>(
    async () => (channelId.value === undefined ? NO_VIDEOS : await getAllVideos(channelId.value)),
    NO_VIDEOS,
    loadingVideos,
  );

  // The page shows what is on the channel now, so the ones YouTube no longer
  // serves are left out. They stay in the archive: a video that was public and
  // is not any more is history, not a mistake.
  const videos = computed<Video[]>(() => archive.value.videos.filter((v) => v.availability === 'public'));
  /**
   * False when some of the archive did not arrive.
   *
   * The detail page adds up view counts and comment counts across every video,
   * so a page that failed would show a smaller total - and a smaller total
   * reads as a fact. This is what lets the page say so instead.
   */
  const videosComplete = computed<boolean>(() => archive.value.complete);
  const videosError = computed<ApiError | undefined>(() => archive.value.error);

  // actions
  const fetching = {
    channels: useIntervalAction(
      1000,
      async () => {
        const { data, freshness: read } = await getChannels();

        channels.value = data.channels;
        fetchedAt.value = data.fetchedAt ?? dayjs(null);
        freshness.value = read;

        // Ask again just after the collector's next run is due. Falling back
        // to the full period when nothing has been collected yet keeps a first
        // load from polling every 30 seconds forever.
        const age = data.fetchedAt === null ? 0 : dayjs().diff(data.fetchedAt, 'second');

        return Math.max(COLLECTION_SECONDS - age + 5, MIN_POLL_SECONDS) * 1000;
      },
      async (e) => {
        console.error(`Fetching channels failed. Retrying in ${RETRY_SECONDS / 60} minutes: ${String(e)}`);

        return RETRY_SECONDS * 1000;
      },
    ),
    live: useIntervalAction(COLLECTION_SECONDS * 1000, async () => {
      const { data } = await getLive();

      liveStreams.value = data.streams;
      excludedFreeChats.value = data.excludedFreeChats;
    }),
  };

  function setChannelId(id: string) {
    channelId.value = id;
  }

  return {
    // states
    channelId,
    channels,
    liveStreams,
    excludedFreeChats,
    fetchedAt,
    freshness,

    // getters
    channel,
    errorOccurred,
    videos,
    videosComplete,
    videosError,
    loadingVideos,

    // actions
    fetching,
    setChannelId,
  };
});

export default () => {
  const store = useStatsStore();

  return {
    ...pick(storeToRefs(store), [
      // states
      'channelId',
      'channels',
      'liveStreams',
      'excludedFreeChats',
      'fetchedAt',
      'freshness',

      // getters
      'channel',
      'errorOccurred',
      'videos',
      'videosComplete',
      'videosError',
      'loadingVideos',
    ]),
    ...pick(store, [
      // actions
      'fetching',
      'setChannelId',
    ]),
  };
};
