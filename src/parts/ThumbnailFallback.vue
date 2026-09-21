<script setup lang="ts">
/**
 * What a video's thumbnail shows when the picture is not there.
 *
 * The image relay (`@/lib/relay`) passes on YouTube's refusal - a 429 when a
 * page asks for a screenful at once, a 404 for a video with no such file - and
 * the browser then has nothing to draw. This is the stand-in for that (#180),
 * so a reader sees the same face where a picture is missing, unless a caller
 * says otherwise where it draws one. It does not tell "failed to load" from
 * "never existed": either way the reader cannot see the picture.
 *
 * It takes the box its caller gives it: the caller's class or style sets the
 * size, and without one it is a 16:9 box as wide as its parent. The mark is
 * sized from that box, so it stays in proportion from a 46px row to a card.
 *
 * It is `aria-hidden`: the picture is `alt=""` and the title beside it says
 * what the row is, so a stand-in has nothing to add to a screen reader.
 */
</script>

<template>
  <span class="thumb-fallback" aria-hidden="true">
    <img class="mark" src="/favicon.svg" alt="" draggable="false" />
  </span>
</template>

<style scoped>
/* Only what the mark needs. `:where` keeps these defaults weaker than the
   caller's own class, which decides the box's size, edge and radius. */
:where(.thumb-fallback) {
  width: 100%;
  border: 1px solid var(--k-line);
  border-radius: 3px;
  background: var(--k-track);
  aspect-ratio: 16 / 9;
  box-sizing: border-box;
}

.thumb-fallback {
  display: block;
  position: relative;
  overflow: hidden;
  container-type: size;
}

/* The site's own favicon, drawn in grey and thinned so it reads as a mark on
   the face and not as a picture (the favicon is multi-coloured). */
.mark {
  position: absolute;
  inset: 0;
  width: min(calc(min(100cqw, 100cqh) * 0.4), 110px);
  height: min(calc(min(100cqw, 100cqh) * 0.4), 110px);
  margin: auto;
  opacity: 0.385;
  filter: grayscale(1);
  pointer-events: none;
  user-select: none;
}
</style>
