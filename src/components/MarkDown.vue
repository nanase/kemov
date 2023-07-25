<script setup lang="ts">
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = withDefaults(
  defineProps<{
    /**
     * The source of Markdown text.
     */
    source: string;

    inline?: boolean;
  }>(),
  { inline: true },
);

marked.setOptions({
  mangle: false,
  headerIds: false,
  gfm: true,
});

function exposeUrl(url: string): string {
  const parsedUrl = new URL(url);

  switch (parsedUrl.protocol) {
    case 'wikien:': {
      return `https://en.wikipedia.org/wiki/${parsedUrl.pathname}${parsedUrl.search}`;
    }
    case 'wiki:':
    case 'wikija:': {
      return `https://ja.wikipedia.org/wiki/${parsedUrl.pathname}${parsedUrl.search}`;
    }
    case 'yt:':
    case 'youtube:': {
      return `https://www.youtube.com/watch?v=${parsedUrl.pathname}${parsedUrl.search.replace('?', '&')}`;
    }

    default: {
      return parsedUrl.href;
    }
  }
}

const renderer = {
  link(href: string, title: string, text: string) {
    // href = cleanUrl(this.options.sanitize, this.options.baseUrl, href);
    href = exposeUrl(href);

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

const markdown = DOMPurify.sanitize(props.inline ? marked.parseInline(props.source) : marked.parse(props.source), {
  ADD_ATTR: ['target'],
});
</script>

<template>
  <span v-html="markdown" v-if="inline"></span>
  <div v-html="markdown" v-else></div>
</template>
