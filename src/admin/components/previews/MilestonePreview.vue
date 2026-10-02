<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { memberAccent, memberColor } from '@/lib/memberColor';
import { drawStatus, type MilestoneStatus } from '@/lib/milestones';
import MilestoneCard from '@/parts/MilestoneCard.vue';
import MilestoneTrail from '@/parts/MilestoneTrail.vue';
import type { Channel, SubscriberMilestone } from '@/type/api';

import { unreadableField } from '../../lib/preview';
import { milestonesWithDraft, publicMilestoneOf } from '../../lib/preview-public';
import { publicChannels, publicMilestones, publicMonths } from '../../lib/public-data';
import { todayJst } from '../../lib/snapshots';
import type { MilestoneFormFields } from '../../lib/subscriber-milestones';

/**
 * The milestone being edited as the statistics and member pages draw it: the
 * card a point opens, and the member's chart with this milestone among their
 * published ones. The chart is where a draft shows whether it becomes a
 * labelled round figure and where its point falls.
 *
 * A milestone not yet saved has no id; it is drawn with -1, which no saved
 * one has.
 */
const props = defineProps<{
  fields: MilestoneFormFields;
  milestoneId: number | null;
  /** The linked event as the panel knows it, or null. */
  event: { eventId: number; title: string; startDate: string } | null;
}>();

const channels = ref<Channel[]>([]);
const published = ref<SubscriberMilestone[]>([]);
const months = ref<string[]>([]);
const status = ref<MilestoneStatus>('loading');

const readout = computed(() => publicMilestoneOf(props.fields, props.milestoneId ?? -1, props.event));
const channel = computed(() => channels.value.find((c) => c.channelId === props.fields.channelId) ?? null);
const shown = computed(() => (readout.value.ok ? milestonesWithDraft(published.value, readout.value.value) : []));
const trailStatus = computed(() => drawStatus(status.value, months.value.length, shown.value.length));
const colors = computed(() =>
  channel.value === null
    ? undefined
    : {
        '--member-color': memberColor(channel.value.color.key, false),
        '--member-accent': memberAccent(channel.value.color.key, false),
      },
);

onMounted(async () => {
  try {
    [channels.value, published.value, months.value] = await Promise.all([
      publicChannels(),
      publicMilestones(),
      publicMonths(),
    ]);
    status.value = 'ready';
  } catch {
    status.value = 'failed';
  }
});
</script>

<template>
  <p v-if="!readout.ok" class="preview-problem">{{ unreadableField(readout.field) }}</p>
  <template v-else>
    <div class="preview-label">点を押したときのカード</div>
    <MilestoneCard style="position: static" :milestone="readout.value" />
    <div class="preview-label">メンバーのふしめ</div>
    <div class="preview-trail" :style="colors">
      <MilestoneTrail
        :milestones="shown"
        :months="months"
        :start="channel?.activityStartDate ?? readout.value.reachedDate"
        :now="channel?.latest.subscriberCount ?? null"
        :today="todayJst()"
        :status="trailStatus"
        :name="channel?.name ?? ''"
      />
    </div>
  </template>
</template>
