<script setup lang="ts">
import { ref, watch } from 'vue';

import { EDITING_TEXT } from '../lib/editing';

/**
 * 削除 in the two steps #277's 6-11 decided: 「削除」 turns into
 * 「削除する」 and 「やめる」, and only 「削除する」 emits `remove`. It goes back
 * to the first step once pressed, so a refused delete does not leave the
 * second one waiting, and whenever it is disabled, so a 保存 pressed meanwhile
 * does not leave 「削除する」 one click away once it is done.
 */
const props = defineProps<{ disabled?: boolean }>();

const emit = defineEmits<{ remove: [] }>();
const confirming = ref(false);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) confirming.value = false;
  },
);

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
