<script setup lang="ts">
import { computed } from 'vue';

import WatchButton, { type ClickWatchButton } from './WatchButton.vue';

import { marked } from 'marked';
import { unescapeHtml } from '@nanase/alnilam';
import DOMPurify from 'dompurify';

const { source } = defineProps<{
  /**
   * The source of Markdown text.
   */
  source: string;
}>();

const emit = defineEmits<ClickWatchButton>();

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

function getProtocol(href: string): string {
  return new URL(href).protocol;
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
    <template v-for="token in tokensList" :key="token.raw">
      <template v-if="token.type === 'text'">{{ unescapeHtml(token.text) }}</template>
      <template v-else-if="token.type === 'link'">
        <a :href="exposeUrl(token.href)" :title="token.title" target="_blank">
          <template v-if="token.tokens?.[0].type === 'text'">{{ unescapeHtml(token.tokens?.[0].text) }}</template>
          <MarkDown v-else :source="token.text" />
        </a>
        <WatchButton
          v-if="getProtocol(token.href) === 'yt:'"
          :url="token.href"
          @click-watch-button="(url, position) => emit('clickWatchButton', url, position)"
        />
      </template>
      <strong v-else-if="token.type === 'strong'">
        <template v-if="token.tokens?.[0].type === 'text'">{{ unescapeHtml(token.tokens?.[0].text) }}</template>
        <MarkDown v-else :source="token.text" />
      </strong>
      <em v-else-if="token.type === 'em'">
        <template v-if="token.tokens?.[0].type === 'text'">{{ unescapeHtml(token.tokens?.[0].text) }}</template>
        <MarkDown v-else :source="token.text" />
      </em>
      <template v-else-if="token.type === 'escape'">{{ token.text }}</template>
      <code v-else-if="token.type === 'codespan'">{{ unescapeHtml(token.text) }}</code>
      <img v-else-if="token.type === 'image'" :src="token.href" :title="token.title" />
      <br v-else-if="token.type === 'br'" />
      <div v-else v-html="(async (code: string) => DOMPurify.sanitize(await marked(code)))(token.raw)"></div>
    </template>
  </span>
</template>
