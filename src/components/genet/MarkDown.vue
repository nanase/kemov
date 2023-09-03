<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const { source } = defineProps<{
  /**
   * The source of Markdown text.
   */
  source: string;
}>();

const emit = defineEmits<{
  clickWatchLink: [url: string, position?: number];
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

marked.use({
  renderer: {
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

      if (url.protocol === 'yt:') {
        const id = url.pathname;
        const position = url.searchParams.get('t');
        out += `<button class="yt-link" data-id="${id}" data-position="${position}"></button>`;
      }

      return out;
    },
    paragraph(text: string) {
      return text;
    },
  },
});

const markdown = computed(() => {
  const tokens = marked.lexer(source);
  const parsedMarkdown = marked.parser(tokens);
  return DOMPurify.sanitize(parsedMarkdown, {
    ADD_ATTR: ['target'],
  });
});

onMounted(() => {
  if (container.value) {
    for (let button of container.value.getElementsByClassName('yt-link')) {
      button.addEventListener('click', function (this: Element) {
        const id = this.getAttribute('data-id');
        const position = Number(this.getAttribute('data-position'));

        if (id) {
          emit('clickWatchLink', id, position);
        }
      });
    }
  }
});

const container = ref<HTMLElement>();
</script>

<template>
  <span class="markdown" ref="container" v-html="markdown"></span>
</template>
