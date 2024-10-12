import { computed, ref } from 'vue';
import { computedAsync } from '@vueuse/core';
import { defineStore, storeToRefs } from 'pinia';
import { mergeArrayBy } from '@nanase/alnilam/array';
import dayjs, { type Dayjs, fromLocale } from '@nanase/alnilam/dayjs';
import { pick } from '@nanase/alnilam/object';
import axios from '@/lib/axios';
import { useIntervalAction } from '@/lib/useIntervalAction';

import { channelsUri, liveUri, statsUri, videoUri } from '@/config';
import type {
  LatestStreaming,
  LatestStreamingResponse,
  YouTubeChannelStatsResponse,
  YouTubeChannelStreamer,
  YouTubeStreamer,
} from '@/type/youtube';
import { type Video, parse as parseAsVideo } from '@/type/video';

const useStatsStore = defineStore('stats', () => {
  // states
  const channelId = ref<string>();
  const channels = ref<YouTubeChannelStreamer[]>([]);
  const latestStreamings = ref<readonly LatestStreaming[]>([]);
  const fetchedAt = ref<Dayjs>(dayjs(null));

  // getters
  const channel = computed<YouTubeChannelStreamer | undefined>(() =>
    channels.value.find((c) => c.id === channelId.value),
  );
  const errorOccurred = computed<boolean>(
    () => fetching.channels.errorOccurred.value || fetching.latestStreamings.errorOccurred.value,
  );
  const videos = computedAsync<Video[]>(async () => {
    if (typeof channel.value !== 'undefined') {
      try {
        return (await axios.get<Video[]>(videoUri(channelId.value), { transformResponse: parseAsVideo })).data.filter(
          (v) => v.availability === 'public',
        );
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }, []);

  // actions
  const fetching = {
    channels: useIntervalAction(
      1000,
      async () => {
        const streamers = (await axios.get<YouTubeStreamer[]>(channelsUri)).data;
        const stats = (await axios.get<YouTubeChannelStatsResponse>(statsUri)).data;
        channels.value = mergeArrayBy('id', streamers, stats.data);
        fetchedAt.value = fromLocale('ja-JP', dayjs.unix(stats.fetched_at));
        return Math.max(Math.floor(600 - (dayjs().unix() - stats.fetched_at)) + 5, 30) * 1000;
      },
      async (e) => {
        console.error(`Fetching error. Retrying in 10 minutes: ${e}`);
        return 600 * 1000;
      },
    ),
    latestStreamings: useIntervalAction(600 * 1000, async () => {
      latestStreamings.value = (await axios.get<LatestStreamingResponse>(liveUri)).data.data;
    }),
  };

  function setChannelId(id: string) {
    channelId.value = id;
  }

  return {
    // states
    channelId,
    channels,
    latestStreamings,
    fetchedAt,

    // getters
    channel,
    errorOccurred,
    videos,

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
      'latestStreamings',
      'fetchedAt',

      // getters
      'channel',
      'errorOccurred',
      'videos',
    ]),
    ...pick(store, [
      // actions
      'fetching',
      'setChannelId',
    ]),
  };
};
