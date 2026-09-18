<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatCalendarAge, formatDate, formatDateTime, formatRecentAge } from '@/lib/timeFormat';

export type UpdatedAtState = 'ok' | 'loading' | 'error';

const {
  at,
  state = 'ok',
  pulse = true,
  dateOnly = false,
  age = 'recent',
} = defineProps<{
  /** The instant the data is from, in epoch milliseconds. */
  at?: number | null;
  state?: UpdatedAtState;
  /**
   * Whether the dot pulses. The pulse says the data is still being fetched,
   * so data edited by hand leaves it off.
   */
  pulse?: boolean;
  /** Writes the date alone, without the time. */
  dateOnly?: boolean;
  /** `recent` for minutes, hours and days; `calendar` for days, months and years. */
  age?: 'recent' | 'calendar';
}>();

const PLACEHOLDER = '—';
/** How often the age is written again. The shortest unit it shows is a minute. */
const TICK_MS = 30_000;

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, TICK_MS);
});

onBeforeUnmount(() => {
  clearInterval(timer);
});

const hasInstant = computed(() => state !== 'loading' && at != null);

const ageText = computed(() => {
  if (state === 'error') return '取得できません';
  if (!hasInstant.value) return PLACEHOLDER;
  return age === 'calendar' ? formatCalendarAge(at!, now.value) : formatRecentAge(at!, now.value);
});

const stampText = computed(() => {
  if (!hasInstant.value) return PLACEHOLDER;
  return dateOnly ? formatDate(at!) : formatDateTime(at!);
});

const datetime = computed(() => (hasInstant.value ? new Date(at!).toISOString() : undefined));
</script>

<template>
  <span class="updated-at" :class="[`state-${state}`, { pulse }]">
    <span class="dot" aria-hidden="true"></span>
    <b class="age">{{ ageText }}</b>
    <time class="stamp" :datetime>{{ stampText }}</time>
  </span>
</template>

<style scoped>
.updated-at {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 10px 4px;
  border: 1px solid var(--k-line);
  border-radius: 5px;
  background: var(--k-surface-2);
  font-size: 12px;
  white-space: nowrap;
  cursor: default;
}

.dot {
  position: relative;
  align-self: center;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--k-text-3);
  color: var(--k-text-3);
}

.age {
  color: var(--k-text-2);
  font-size: 12.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.stamp {
  color: var(--k-text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* A ring that widens and fades around the dot while the data is live. */
.pulse.state-ok .dot {
  background: var(--k-ok);
  color: var(--k-ok);
}

.pulse.state-ok .dot::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 1px solid currentcolor;
  border-radius: 50%;
  opacity: 0.35;
  animation: updated-at-breath 3.6s ease-in-out infinite;
}

.pulse.state-ok .age {
  color: var(--k-ok);
}

/* A failed fetch stops the ring and leaves it faintly in the warning colour. */
.state-error .dot {
  background: var(--k-warn);
  color: var(--k-warn);
}

.pulse.state-error .dot::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 1px solid currentcolor;
  border-radius: 50%;
  opacity: 0.5;
}

.state-error .age {
  color: var(--k-warn);
}

@keyframes updated-at-breath {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.8);
  }

  55% {
    opacity: 0;
    transform: scale(1.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse.state-ok .dot::after {
    animation: none;
  }
}
</style>
