<script setup lang="ts">
import { ref } from 'vue';

import { EDITING_TEXT } from '../lib/editing';

/**
 * 削除 in two steps, as メンバー has it (#277's 6-11): 「削除」 turns into
 * 「削除する」 and 「やめる」, and only 「削除する」 emits `remove`. It goes back
 * to the first step once pressed, so a refused delete does not leave the
 * second one waiting.
 */
defineProps<{ disabled?: boolean }>();

const emit = defineEmits<{ remove: [] }>();
const confirming = ref(false);

function remove(): void {
  confirming.value = false;
  emit('remove');
}
</script>

<template>
  <template v-if="confirming">
    <button class="btn danger" type="button" :disabled="disabled" @click="remove">
      {{ EDITING_TEXT.removeConfirm }}
    </button>
    <button class="btn quiet" type="button" @click="confirming = false">{{ EDITING_TEXT.removeCancel }}</button>
  </template>
  <button v-else class="btn danger" type="button" :disabled="disabled" @click="confirming = true">
    {{ EDITING_TEXT.remove }}
  </button>
</template>
