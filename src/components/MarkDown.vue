<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const { source, inline = true } = defineProps<{
  /**
   * The source of Markdown text.
   */
  source: string;

  inline?: boolean;
}>();

marked.setOptions({
  mangle: false,
  headerIds: false,
  gfm: true,
});

function exposeUrl(url: URL): string {
  switch (url.protocol) {
    case 'wikien:': {
      return `https://en.wikipedia.org/wiki/${url.pathname}${url.hash}${url.search}`;
    }
    case 'wiki:': {
      return `https://ja.wikipedia.org/wiki/${url.pathname}${url.hash}${url.search}`;
    }
    case 'yt:': {
      return `https://www.youtube.com/watch?v=${url.pathname}${url.search.replace('?', '&')}`;
    }

    default: {
      return url.href;
    }
  }
}

const renderer = {
  link(href: string, title: string, text: string) {
    const url = new URL(href);
    href = exposeUrl(url);

    if (href === null) {
      return text;
    }

    let out = `<a target="_blank" href="${href}"`;

    if (title) {
      out += ` title="${title}"`;
    }

    out += `>${text}</a>`;
    return out;
  },
};

marked.use({ renderer });

const markdown = computed(() =>
  DOMPurify.sanitize(inline ? marked.parseInline(source) : marked.parse(source), {
    ADD_ATTR: ['target'],
  }),
);
</script>

<template>
  <span class="markdown" v-html="markdown" v-if="inline"></span>
  <div class="markdown" v-html="markdown" v-else></div>
</template>
