<script setup lang="ts">
import { computed } from 'vue';

import { memberColor, memberInk } from '@/lib/memberColor';
import { relayChannelIconURL } from '@/lib/relay';
import MemberAvatar from '@/parts/MemberAvatar.vue';

import type { MemberFormFields } from '../../lib/members';

/**
 * A member as the public pages show them, put together from the parts they
 * are drawn with: the face at the sizes it comes in, the name in the
 * member's own colour, and the span of their activity. No one page shows
 * all of it in one place; the member page adds numbers this panel does not
 * edit.
 *
 * The face is the icon the collector last read, which a new member does not
 * have yet - the stand-in is what the pages draw too.
 */
const props = defineProps<{
  fields: MemberFormFields;
  channelId: string;
  /** Whether the collector has read an icon for this channel. */
  hasIcon: boolean;
}>();

const HEX = /^#[0-9a-f]{6}$/i;

const color = computed(() => (HEX.test(props.fields.colorKey) ? props.fields.colorKey : null));
const icon = computed(() => (props.hasIcon ? relayChannelIconURL(props.channelId) : null));
const period = computed(() =>
  props.fields.activityEndDate === null || props.fields.activityEndDate === ''
    ? `${props.fields.activityStartDate} から`
    : `${props.fields.activityStartDate} → ${props.fields.activityEndDate}`,
);
</script>

<template>
  <p v-if="color === null" class="preview-problem">色の key が「#RRGGBB」の形でないので、色を描けません</p>
  <div class="preview-member">
    <MemberAvatar :src="icon" :name="fields.name" :color="color" :size="54" :dark="false" />
    <div>
      <div class="preview-member-name" :style="color ? { color: memberInk(color, false) } : undefined">
        {{ fields.name }}
      </div>
      <div v-if="fields.globalname" class="preview-member-sub">{{ fields.globalname }}</div>
      <div class="preview-member-sub">{{ period }}</div>
    </div>
  </div>
  <div class="preview-label">一覧や年表での顔</div>
  <div class="preview-faces">
    <span class="preview-face">
      <MemberAvatar :src="icon" :name="fields.name" :color="color" :size="28" :dark="false" />
      {{ fields.name }}
    </span>
    <span class="preview-face">
      <MemberAvatar :src="icon" :name="fields.name" :color="color" :size="22" :dark="false" />
      {{ fields.name }}
    </span>
    <span class="preview-face">
      <i :style="{ background: color ? memberColor(color, false) : undefined }"></i>
      {{ fields.name }}
    </span>
  </div>
</template>
