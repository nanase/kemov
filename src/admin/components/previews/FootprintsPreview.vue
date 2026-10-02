<script setup lang="ts">
import '@/footprints/panel.css';

import { computed, onMounted, ref } from 'vue';

import { formatDayOfMonth } from '@/footprints/draw';
import { eventItems } from '@/footprints/model';
import EventCard from '@/footprints/parts/EventCard.vue';
import type { Channel } from '@/type/api';

import type { EventFormFields } from '../../lib/footprints';
import { unreadableField } from '../../lib/preview';
import { publicEventOf } from '../../lib/preview-public';
import { publicChannels } from '../../lib/public-data';

/**
 * The あしあと timeline's own card for the row being edited, with the day it
 * sits on. The card is the public part itself, fed what publishing would
 * write. The stream the event points at is not looked up, so a large card's
 * caption names the kind rather than the stream's length.
 */
const props = defineProps<{
  fields: EventFormFields;
  eventId: number;
}>();

const channels = ref<Channel[]>([]);
const channelsFailed = ref(false);

const readout = computed(() => publicEventOf(props.fields, props.eventId));
const item = computed(() => (readout.value.ok ? eventItems([readout.value.value], new Map(), Date.now())[0]! : null));
const members = computed(() =>
  readout.value.ok
    ? readout.value.value.channelIds.flatMap((id) => channels.value.filter((c) => c.channelId === id))
    : [],
);

/** The month heading and the day the timeline writes beside the card. */
const place = computed(() => {
  const event = readout.value.ok ? readout.value.value : null;

  if (event === null) return null;

  const [year, month] = event.startDate.split('-');
  const heading = month === undefined ? `${year}年` : `${year}年${Number(month)}月`;

  return { heading, day: event.datePrecision === 'day' && item.value ? formatDayOfMonth(item.value.at) : '' };
});

onMounted(async () => {
  try {
    channels.value = await publicChannels();
  } catch {
    channelsFailed.value = true;
  }
});
</script>

<template>
  <p v-if="!readout.ok" class="preview-problem">{{ unreadableField(readout.field) }}</p>
  <template v-else-if="item && place">
    <p v-if="channelsFailed" class="preview-problem">メンバーの一覧を読めないので、顔と名前を省いています</p>
    <div class="preview-month">{{ place.heading }}</div>
    <div class="preview-road">
      <span class="preview-day">{{ place.day }}</span>
      <EventCard :item="item" :members="members" :dark="false" />
    </div>
  </template>
</template>
