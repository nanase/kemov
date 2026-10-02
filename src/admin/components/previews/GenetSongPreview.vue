<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import SongDetail from '@/genet/music/SongDetail.vue';
import { tuneOccurrences, type SongPlay } from '@/lib/genet/musicSong';
import type { GenetStream } from '@/lib/genet/musicTypes';

import type { GenetPerson } from '../../lib/genet-people';
import type { StreamFormFields } from '../../lib/genet-streams';
import type { TuneFormFields } from '../../lib/genet-tunes';
import { unreadableField } from '../../lib/preview';
import { publicSongOf, streamsWithDraft } from '../../lib/preview-public';
import { publicGenetStreams } from '../../lib/public-data';

/**
 * The 楽曲 panel of ジェネット楽曲一覧 for the tune open in the editor,
 * drawn by the page's own SongDetail.vue. 演奏した回数 counts the streams the
 * page lists now, with this one as it is in the editor.
 */
const props = defineProps<{
  tune: TuneFormFields;
  tuneId: number;
  stream: StreamFormFields;
  videoId: string;
  people: readonly GenetPerson[];
}>();

const readout = computed(() => publicSongOf(props.tune, props.tuneId, props.stream, props.videoId, props.people));

const published = ref<GenetStream[]>([]);
const publishedFailed = ref(false);

onMounted(async () => {
  try {
    published.value = await publicGenetStreams();
  } catch {
    publishedFailed.value = true;
  }
});

const occurrences = computed(() =>
  readout.value.ok
    ? tuneOccurrences(streamsWithDraft(published.value, readout.value.value.stream), props.tuneId, props.videoId)
    : [],
);

/** This stream's note on the tune, as the page finds it: the first performance of it. */
const description = computed(() =>
  readout.value.ok
    ? (readout.value.value.stream.performances.find((p) => p.tune_id === props.tuneId)?.description ?? null)
    : null,
);

/** `2 / 9`, the tune's place among the stream's performances, as the panel's head writes it. */
const position = computed(() => {
  const no = props.stream.performances.findIndex((p) => p.tuneId === props.tuneId) + 1;

  return `${no} / ${props.stream.performances.length}`;
});

const play = ref<SongPlay | null>(null);

watch(
  () => props.tuneId,
  () => (play.value = null),
);
</script>

<template>
  <p v-if="!readout.ok" class="preview-problem">{{ unreadableField(readout.field) }}</p>
  <template v-else>
    <p v-if="publishedFailed" class="preview-problem">
      公開中の一覧を読めないので、演奏した回数はこの配信だけで数えています
    </p>
    <div class="gm">
      <div class="panel">
        <div class="ph">
          <b>楽曲</b>
          <span class="n">{{ position }}</span>
        </div>
        <SongDetail
          v-model:play="play"
          :tune="readout.value.tune"
          :description="description"
          :people="readout.value.people"
          :occurrences="occurrences"
          :occurrence-links="false"
        />
      </div>
    </div>
  </template>
</template>
