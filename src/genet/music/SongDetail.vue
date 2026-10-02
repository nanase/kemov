<script setup lang="ts">
import './board.css';

import { unescapeHtml } from '@nanase/alnilam/string';

import ThumbnailFallback from '@/parts/ThumbnailFallback.vue';
import { publishedDateText } from '@/lib/genet/musicFormat';
import type { SearchTerm } from '@/lib/genet/musicSearch';
import { creditText, markdownHtml, type SongPlay, type TuneOccurrence } from '@/lib/genet/musicSong';
import type { GenetPerson, GenetTune } from '@/lib/genet/musicTypes';
import { getEmbedURL } from '@/lib/youtube';
import { thumbSrc, useThumbFallback } from './useThumbFallback';

/**
 * The body of the 楽曲 panel: one tune, how this stream performed it, and
 * every stream that performed it. Drawn inside a `.gm` (board.css), by
 * MusicApp.vue and by the admin site's preview of a tune being edited.
 */
const props = withDefaults(
  defineProps<{
    tune: GenetTune;
    /** This stream's own note on the performance, with its 配信の時刻 links. */
    description: string | null;
    people: readonly GenetPerson[];
    occurrences: readonly TuneOccurrence[];
    /** What the search box asks for, marked in the text. */
    terms?: readonly SearchTerm[];
    /** What the embedded player plays, or null while it is closed. */
    play: SongPlay | null;
    /** Whether an occurrence opens its stream. The admin preview has nowhere to go. */
    occurrenceLinks?: boolean;
  }>(),
  { terms: () => [], occurrenceLinks: true },
);

const emit = defineEmits<{
  'update:play': [play: SongPlay | null];
  occurrence: [videoId: string];
}>();

const { failed: failedThumbs, onError: onThumbError } = useThumbFallback();

function md(source: string | null): string {
  return markdownHtml(source, props.terms);
}

/** A time button in the description plays from its second, or stops when it is already what plays. */
function onTimeClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest('button.tbtn') as HTMLButtonElement | null;

  if (!target) return;

  const videoId = target.dataset.vid;
  const at = Number(target.dataset.at ?? '0');

  if (!videoId) return;

  emit('update:play', props.play?.videoId === videoId && props.play.seconds === at ? null : { videoId, seconds: at });
}
</script>

<template>
  <div class="td" @click="onTimeClick">
    <div class="tdt" v-html="md(tune.title)"></div>
    <div v-if="tune.original_title" class="tdo">
      {{ unescapeHtml(tune.original_title) }}
    </div>

    <dl v-if="tune.attributes.length > 0" class="attrs">
      <template v-for="(a, ai) in tune.attributes" :key="ai">
        <template v-if="a.name">
          <dt>{{ a.name }}</dt>
          <dd class="v">
            <span v-if="a.text" v-html="md(a.text)"></span>
            <span v-else>{{ creditText(a.people, people) }}</span>
          </dd>
        </template>
        <dd v-else class="solo" v-html="md(a.text)"></dd>
      </template>
    </dl>

    <ul v-if="tune.subtunes.length > 0" class="subs">
      <li v-for="(s, si) in tune.subtunes" :key="si" v-html="md(s)"></li>
    </ul>

    <div v-if="description" class="desc" v-html="markdownHtml(description, terms, { playing: play })"></div>

    <div v-if="play" class="vplay lead">
      <figure class="frame">
        <span class="mat"
          ><iframe
            class="video-embed"
            :src="`${getEmbedURL(play.videoId)}?start=${play.seconds}`"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            frameborder="0"
          ></iframe
        ></span>
        <button class="pclose" type="button" aria-label="閉じる" @click="emit('update:play', null)">
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </figure>
    </div>

    <div v-if="tune.videos.length > 0" class="sec">
      <div class="sech">原曲などの動画</div>
      <div v-for="v in tune.videos" :key="v.video_id" class="vrow">
        <ThumbnailFallback v-if="failedThumbs.has(v.video_id)" class="vthumb" />
        <img
          v-else
          class="vthumb"
          :src="thumbSrc(v.video_id)"
          :data-video-id="v.video_id"
          loading="lazy"
          decoding="async"
          alt=""
          @error="onThumbError"
        />
        <div class="vt">{{ unescapeHtml(v.title) }}</div>
        <a class="ibtn" :href="`https://www.youtube.com/watch?v=${v.video_id}`" target="_blank" rel="noopener"
          >YouTube で開く</a
        >
      </div>
    </div>

    <div v-if="tune.scores.length > 0" class="sec">
      <div class="sech">楽譜</div>
      <div v-for="(sc, si) in tune.scores" :key="si" class="rrow">
        <a :href="sc.url" target="_blank" rel="noopener">{{ unescapeHtml(sc.title) }}</a>
      </div>
    </div>

    <div class="sec">
      <div class="sech">演奏した回数: {{ occurrences.length }}</div>
      <div v-for="o in occurrences" :key="o.stream.video_id" class="orow" :class="{ cur: o.isCurrent }">
        <span class="od">{{ publishedDateText(o.stream.published_at) }}</span>
        <button class="ot" type="button" :disabled="!occurrenceLinks" @click="emit('occurrence', o.stream.video_id)">
          {{ unescapeHtml(o.stream.short_title || o.stream.title) }}
        </button>
      </div>
    </div>
  </div>
</template>
