<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { unescapeHtml } from '@/lib/string';

const { source } = defineProps<{
  /**
   * The source of Markdown text.
   */
  source: string;
}>();

const emit = defineEmits<{
  clickWatchLink: [url: string, position?: number];
}>();

function exposeUrl(input: string): string {
  const url = new URL(input);

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

const tokensList = computed(() => {
  const tokens = marked.lexer(source);

  if (tokens.length === 1 && tokens[0].type === 'paragraph') {
    return tokens[0].tokens;
  }

  return tokens;
});

function getProtocol(input: string): string {
  return new URL(input).protocol;
}

function getYouTubeId(input: string): string {
  return new URL(input).pathname;
}

function getYouTubePosition(input: string): number {
  return Number(new URL(input).searchParams.get('t') ?? '0');
}
</script>

<template>
  <span class="markdown">
    <span v-for="token in tokensList" :key="token.raw">
      <span v-if="token.type === 'text'">{{ unescapeHtml(token.text) }}</span>
      <span v-else-if="token.type === 'link'">
        <a :href="exposeUrl(token.href)" :title="token.title" target="_blank">
          <MarkDown :source="token.text" />
        </a>
        <button
          class="yt-link"
          v-if="getProtocol(token.href) === 'yt:'"
          @click="emit('clickWatchLink', getYouTubeId(token.href), getYouTubePosition(token.href))"
        ></button>
      </span>
      <strong v-else-if="token.type === 'strong'"><MarkDown :source="token.text" /></strong>
      <em v-else-if="token.type === 'em'"><MarkDown :source="token.text" /></em>
      <span v-else-if="token.type === 'escape'">{{ token.text }}</span>
      <code v-else-if="token.type === 'codespan'">{{ unescapeHtml(token.text) }}</code>
      <span v-else-if="token.type === 'html'" v-html="DOMPurify.sanitize(token.raw)"></span>
      <img v-else-if="token.type === 'image'" :src="token.href" :title="token.title" />
      <br v-else-if="token.type === 'br'" />
    </span>
  </span>
</template>
