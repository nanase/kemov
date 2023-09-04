<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { unescapeHtml } from '@/lib/string';
import WatchButton from './WatchButton.vue';

const { source } = defineProps<{
  /**
   * The source of Markdown text.
   */
  source: string;
}>();

const emit = defineEmits<{
  clickWatchButton: [url: string, position?: number];
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
</script>

<template>
  <span class="markdown">
    <span v-for="token in tokensList" :key="token.raw">
      <span v-if="token.type === 'text'">{{ unescapeHtml(token.text) }}</span>
      <span v-else-if="token.type === 'link'">
        <a :href="exposeUrl(token.href)" :title="token.title" target="_blank">
          <MarkDown :source="token.text" />
        </a>
        <WatchButton
          :url="token.href"
          @click-watch-button="(url, position) => emit('clickWatchButton', url, position)"
        />
      </span>
      <strong v-else-if="token.type === 'strong'"><MarkDown :source="token.text" /></strong>
      <em v-else-if="token.type === 'em'"><MarkDown :source="token.text" /></em>
      <span v-else-if="token.type === 'escape'">{{ token.text }}</span>
      <code v-else-if="token.type === 'codespan'">{{ unescapeHtml(token.text) }}</code>
      <img v-else-if="token.type === 'image'" :src="token.href" :title="token.title" />
      <br v-else-if="token.type === 'br'" />
      <div v-else v-html="DOMPurify.sanitize(marked(token.raw))"></div>
    </span>
  </span>
</template>
