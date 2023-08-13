<script setup lang="ts">
import { type EmbeddedVideo } from '@/types/genet';
import { onMounted, ref, watch } from 'vue';
import { getThumbnailURL, getEmbedURL } from '@/lib/youtube';

const props = defineProps<{
  /**
   * The Video Object of the link to YouTube video.
   */
  video: EmbeddedVideo;
}>();

const player = ref<HTMLDivElement>();
let embedElement: HTMLElement | undefined;

/*
 * This code is based on:
 * https://www.labnol.org/internet/light-youtube-embeds/27941/
 *
 * Light YouTube Embeds by @labnol
 * Credit: https://www.labnol.org/
 */

function createEmbedElements() {
  if (embedElement) {
    player.value?.removeChild(embedElement);
  }

  const div = document.createElement('div');
  div.setAttribute('data-id', props.video.id);

  const thumbNode = document.createElement('img');
  thumbNode.src = getThumbnailURL(props.video.id, { size: 'hq' });
  div.appendChild(thumbNode);

  const playButton = document.createElement('div');
  playButton.setAttribute('class', 'play');
  div.appendChild(playButton);

  div.onclick = function () {
    const iframe = document.createElement('iframe');
    const start = Number.isFinite(props.video.position) ? `start=${props.video.position}` : '';
    iframe.setAttribute('src', `${getEmbedURL(props.video.id)}?${start}`);
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '1');
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    );
    div.parentNode?.removeChild(div);
    player.value?.appendChild(iframe);
    embedElement = iframe;
  };
  player.value?.appendChild(div);
  embedElement = div;
}

onMounted(createEmbedElements);
watch(props, createEmbedElements);
</script>

<template>
  <div class="player-container">
    <div ref="player" class="youtube-player"></div>
  </div>
</template>

<style lang="scss">
.player-container {
  min-width: 160px;
  aspect-ratio: 16 / 9;

  .youtube-player {
    position: relative;
    padding-bottom: 56.25%;
    height: 0;
    overflow: hidden;
    max-width: 100%;
    background: #000;

    iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 100;
      background: transparent;
    }

    img {
      object-fit: cover;
      display: block;
      margin: auto;
      max-width: 100%;
      width: 100%;
      position: absolute;
      inset: 0;
      border: none;
      height: auto;
      cursor: pointer;
      transition: 0.4s all;
    }

    img:hover {
      filter: brightness(75%);
    }

    .play {
      height: 48px;
      width: 68px;
      left: 50%;
      top: 50%;
      margin-left: -34px;
      margin-top: -24px;
      position: absolute;
      background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEQAAAAwCAYAAACooNxlAAAFSElEQVRo3uXbe4xcVR3A8c+5d2em25XSTQW7tAJ9IBpofBAjK/80avARQW2tj2ig/FMTNWqNWqi2Gg3wh4nBQFJpY1CQvzQ+QgwE+4cpLQaTJlbBiBJXu8UthXZ3251uZ3fmHv+YgX10tlIzLzq/5ObO3Lk5v3O/83ude84JGiRxUK9Ev5wlyvok+lT0SSwW9Un0ivKinEQiygkSmZxEjygTTMlEwZQok5qWmRaUUJQpShVVnJYp4pSKUU+ZCGSNeI5wXg99g4ukrhStllktWIEBwWW4GAXkakfPrCOHtHYktebSaqMSQYKo+lDzzxkqKKMsmBZrn5nClGhCcFTmqNQRmcOifyob8pQXzwfWgkAiwaB+Oe+T2SR4l2hFrfOvFYkYl/mz4HfyHjLuP+Gg6fMCEm/Up+jDEl8XvUM4P0vqYHlRdL/E7rDP8KsCEm+y2Kit2Ca4yIUnJdGjMp8LTzo2/8fkLDcZtVGw9QKFoRbnbpbaHTfV4thCQKy3ArdhmQtZqnHwA16w8dxApr1FcL3ukLzoY3FQ78JAUjcw94YL2k5YI2flwkBYp7tkmWD5wkAyb+4yIP2iS+oCiev1CFZ1GZAlokvjrPJjtoUs76L4MRM1gze4Ts/ZQDKXN139Ld/imkFCR1X/A5bJ1wNyRdNVr76W+57gG3u45noKHWCQ0XJTcvVcZqA1Rpryoc3s+Bm37mD5le1GcolKPSDB61tXASRctoZPfpUfPM6GL7Kor32ZRr0YEtpQrucKrLyKL93D3b9h7duq11orS6UzY5pkli+1b/ySpFz3Xu7Zy5Y7edPbyeVbFUMudqaehVTfeLW5KljGpq1s/ymf+lr1e/ML+F6pQj0LWdQRSTBJWL2OW3ey6wDrP04IzUUSZ+qv2TEkr5MkX+CNV7PjYbb/hLVvpadJXczPGMNsC+ksIK8E3jzvv4U7f8Vnb2fVtY0v7Mr1gAQFnSwDq9i8k+0PsOEL9C1pZGCt6zKd/yI5SasWcvnVpD2Na7en3vA/M9XRMCbGObSPnZ/gh1/m5InGtV1xql7a7UwglTJP/4EfbeP2m3nyEbJKY3X0mHhtAJkY44Fv873P8NsfUxxvjp7qtOg8IIlSx4CYLnHgETav48G7GBmqWkpzZEoyM5M3O+2ebDuI0iSHnuD7W/jupzl2pBVaTynPzP3OBnK8fe8kMoaeYff2qns89iCTxVZpH6tNnp+VdtsDJEZ+cS/f/Ci/vI9jw63uwbiySj0LOdFCCpRO85f9bHkn936FI881M06cqyvjXlfPQhIjLXOPv/6RXdu44yM8e7C9cSs4IdR3mcNNV370X9x/B3ffxq93Nba4+v+BvGB0Jsu8Uq7Hd1sj9VxTlRd6KU+3xzUWdpnvmHTXy4tokllD4OdRaary0mRnwSATHHOwjsuE3ztDC9ymw2ph0UuhuvTqrNIdnu0yIKOil+YMqOfd8LcuAzImPTeQAyh3DY7gsPzcMDEXSNmf8EyX4JgW7A17jS8MZMq/ZR4Wne4CIE+reGj+xTlAwkHTcvYIHhUbs1S6AyXiiGBj2G/0nEBq6XdMxeexR/C8WSnpApCi4DGJDWGfofphZSGMH1Rw0nskbhQNSqwV9deD2PEQomHBIdHj2Gu/4bDAHx3+h20FgxYp6JMoKFkqtQZXYS2uEK0UrRT0t/GhSzIjgmHBYdEQ/i76h2hExRlMvppdEw2beog3WaxoQMWlNUtaKrNUqJ3T2m6JqK+2A+LlnRN51dXFFcGkKBNNCiqYrG0VKWKsVkiNi8akxqSOKxmxwvHw88YMO/4LUQaiWZq8z7AAAAAASUVORK5CYII=')
        no-repeat;
      cursor: pointer;
    }
  }
}
</style>
