<script setup lang="ts">
import { computed, ref } from 'vue';

import { postJson } from '../lib/api';
import { forgetPublicData } from '../lib/preview';
import { refreshSidebarDrafts } from '../lib/sidebar-drafts';
import { bandShown, REPUBLISH_PATH, REPUBLISH_TEXT, republishedToast, republishFailedToast } from '../lib/republish';
import { showToast } from '../lib/toast';

/**
 * The message above a list while its public JSON needs 「本番に反映」 (#285),
 * and the button that builds the JSON again from the records. `text` is
 * lib/republish.ts's answer; null draws nothing. Every press reads the
 * list's pending state again through `reload`, which answers the generation
 * of the read it started; `held` is the generation `text` comes from, so a
 * press that went through hides the message until a later read
 * (`bandShown`).
 */
const props = defineProps<{
  target: keyof typeof REPUBLISH_PATH;
  text: string | null;
  held: number;
  reload: () => number;
}>();
const publishing = ref(false);
const hiddenThrough = ref<number | null>(null);
const shown = computed(() => bandShown(props.text, hiddenThrough.value, props.held));

async function publishNow(): Promise<void> {
  publishing.value = true;

  try {
    const body = await postJson<{ published: boolean }>(REPUBLISH_PATH[props.target], {});

    // The preview reads the public JSON, which has just changed.
    if (body.published) forgetPublicData();

    hiddenThrough.value = props.reload();
    showToast(republishedToast(body.published));
  } catch (error) {
    // Whatever was written, the notes in the edit panel follow the worker again.
    props.reload();
    showToast(republishFailedToast(error));
  } finally {
    publishing.value = false;
    void refreshSidebarDrafts();
  }
}
</script>

<template>
  <div v-if="shown" class="list-band">
    <div class="panel flag">
      <h4>{{ text }}</h4>
      <button class="btn primary" type="button" :disabled="publishing" @click="publishNow">
        {{ REPUBLISH_TEXT.button }}
      </button>
    </div>
  </div>
</template>
