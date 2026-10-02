<script setup lang="ts">
/**
 * The column beside an edit panel that draws the row as the public site
 * would. What goes in it is the screen's own; this is the frame: the public
 * site's ground and type (Murecho), and a container of its own, so a public
 * part's container queries measure this column rather than the page.
 */
defineProps<{
  /** Where the change shows once saved (`PREVIEW_NOTES`). */
  note: string;
  /** A public page's own colours, as that page opts in on its root (`src/shell/palette-*.css`). */
  palette?: string;
}>();
</script>

<template>
  <aside class="preview" aria-label="プレビュー">
    <div class="preview-head">プレビュー</div>
    <div class="preview-frame" :data-palette="palette">
      <slot />
    </div>
    <p class="hint">{{ note }}</p>
  </aside>
</template>
