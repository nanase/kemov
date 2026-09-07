<script setup lang="ts">
import { computed } from 'vue';
import { sum } from '@nanase/alnilam/array';
import { withCommas } from '@nanase/alnilam/number';
import dayjs from '@nanase/alnilam/dayjs';

import { getChannelURL } from '@/lib/youtube';
import { toDifference, totalDifference, type Difference } from '@/lib/difference';
import type { Channel, CountName } from '@/type/api';
import useStatsStore from '@/stats/store';

import DifferenceValue from '@/components/stats/DifferenceValue.vue';

const { channels, liveStreams } = useStatsStore();

export type StatDataType = 'subscriber' | 'view' | 'video';

const { type, activeOnly } = defineProps<{
  type: StatDataType;
  activeOnly?: boolean;
}>();

/** Which of the three counts this table is showing, by the tab's name for it. */
const COUNT_OF: Readonly<Record<StatDataType, CountName>> = {
  subscriber: 'subscriberCount',
  view: 'viewCount',
  video: 'videoCount',
};

const countName = computed<CountName>(() => COUNT_OF[type]);

const visibleChannels = computed<Channel[]>(() =>
  channels.value.filter((channel) =>
    activeOnly && channel.activityEndDate !== null ? dayjs().isBefore(channel.activityEndDate) : true,
  ),
);

function getColumnName(): string {
  switch (type) {
    case 'subscriber':
      return '登録数';
    case 'view':
      return '再生数';
    case 'video':
      return '動画数';
  }
}

/**
 * The channel's current count, or null when it has none.
 *
 * Null is "the channel hides this", which YouTube reports as zero and the
 * schema refuses to store as zero for that reason. Shown as a dash rather than
 * as a number nobody published.
 */
function getCount(channel: Channel): number | null {
  return channel.latest[countName.value];
}

function formatCount(channel: Channel): string {
  const count = getCount(channel);

  return count === null ? '—' : withCommas(count);
}

const perHour = (channel: Channel): Difference => toDifference(channel.perHour[countName.value]);
const perDay = (channel: Channel): Difference => toDifference(channel.perDay[countName.value]);

const totalPerHour = computed<Difference>(() =>
  totalDifference(visibleChannels.value.map((channel) => channel.perHour[countName.value])),
);
const totalPerDay = computed<Difference>(() =>
  totalDifference(visibleChannels.value.map((channel) => channel.perDay[countName.value])),
);

function getStrong(): number {
  switch (type) {
    case 'subscriber':
      return 100;
    case 'view':
      return 1000;
    case 'video':
      return 10;
  }
}

function getMaxSubscriberCount(x: number): number {
  if (x >= 1000) {
    return x + 10 ** (BigInt(x).toString().length - 3) - 1;
  } else {
    return x;
  }
}

/** The counts that are there. A channel hiding its count is left out. */
const knownCount = (channel: Channel): number => getCount(channel) ?? 0;

function getAverageSubscriberCount(): number {
  const total = sum(visibleChannels.value, knownCount);

  return Math.round(
    total + (sum(visibleChannels.value, (channel) => getMaxSubscriberCount(knownCount(channel))) - total) / 2,
  );
}

/**
 * What this channel is doing right now, from /api/live.
 *
 * Three states rather than one, because the badge means three different
 * things: on air, about to start, and announced for later today. The endpoint
 * says which directly - the collector settled that in #64 - where the list
 * this replaces reported one "latest streaming" per channel and left the page
 * to work out what it was from timestamps.
 */
function streamOf(channelId: string) {
  return liveStreams.value.find((stream) => stream.channelId === channelId);
}

function hasLive(channelId: string): boolean {
  return streamOf(channelId)?.state === 'live';
}

/** Announced, and starting within `hours`. */
function startsWithin(channelId: string, hours: number): boolean {
  const stream = streamOf(channelId);

  if (stream === undefined || stream.state !== 'upcoming' || stream.scheduledStartTime === null) return false;

  const minutes = stream.scheduledStartTime.diff(dayjs(), 'minute');

  return minutes >= 0 && minutes <= hours * 60;
}
</script>

<template>
  <v-table density="compact" hover>
    <thead v-if="channels.length !== 0">
      <tr>
        <th scope="col" class="pl-4 pr-2">&nbsp;</th>
        <th scope="col" class="px-2 text-right font-weight-bold">{{ getColumnName() }}</th>
        <th scope="col" class="px-2 text-right font-weight-bold" v-if="type === 'subscriber'">1時間</th>
        <th scope="col" class="pl-2 pr-4 text-right font-weight-bold">24時間</th>
      </tr>
    </thead>
    <tbody>
      <tr class="channel text-right" v-for="channel in visibleChannels" :key="channel.channelId">
        <th scope="row" class="channel-name-head pl-4 pr-2">
          <v-list-item
            class="channel-name text-left px-0"
            :href="channel.customUrl ? getChannelURL(channel.customUrl) : undefined"
            :ripple="false"
            slim
          >
            <template v-slot:title>
              <div class="channel-name-box">
                <span class="channel-name-text">{{ channel.name }}</span>
              </div>
            </template>
            <template v-slot:prepend>
              <div v-if="hasLive(channel.channelId)" class="live-badge has-live"></div>
              <div v-else-if="startsWithin(channel.channelId, 1)" class="live-badge has-live-to-start-soon"></div>
              <div v-else-if="startsWithin(channel.channelId, 3)" class="live-badge has-live-before-start"></div>
              <v-avatar class="avatar" :color="channel.color.key" variant="outlined" size="small">
                <v-img v-if="channel.thumbnailUrl" :src="channel.thumbnailUrl" :alt="channel.fullname" />
                <span v-else class="text-caption">{{ channel.name.slice(0, 1) }}</span>
              </v-avatar>
            </template>
          </v-list-item>
        </th>
        <td class="px-2 text-h6">{{ formatCount(channel) }}</td>
        <DifferenceValue
          class="px-2 text-h6"
          :difference="perHour(channel)"
          :strong="getStrong()"
          tag="td"
          v-if="type === 'subscriber'"
        />
        <DifferenceValue class="pl-2 pr-4 text-h6" :difference="perDay(channel)" :strong="getStrong()" tag="td" />
      </tr>
      <tr v-if="channels.length === 0">
        <td colspan="4" class="pa-4 text-center">
          <v-progress-circular color="primary" indeterminate />
        </td>
      </tr>
    </tbody>
    <tfoot v-if="channels.length !== 0">
      <tr class="text-right text-h6">
        <th scope="row" class="pl-4 pr-2 text-right text-body-1 font-weight-bold">
          <v-dialog v-if="type === 'subscriber'" max-width="640">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                icon="mdi-information-outline"
                variant="plain"
                density="compact"
                aria-label="チャンネル登録者数について"
              />
            </template>

            <template #default="{ isActive }">
              <v-card title="チャンネル登録者数について">
                <v-card-text>
                  <p>
                    YouTube の制約により、チャンネル登録者数の正確な数値はチャンネルの所有者のみに開示されます。
                    それ以外の利用者には数値の上位3桁のみが開示されます。
                  </p>
                  <p>
                    したがって、このサイトで表示している数値は上位3桁のみの最小値であり、正確な数値はこれ以上となります。
                    下記の数値は合計値の参考としてお考えください。
                  </p>
                </v-card-text>
                <v-card-text>
                  <v-timeline class="text-center" direction="horizontal" side="end" size="small" density="compact">
                    <v-timeline-item icon="mdi-flag-checkered" dot-color="green">
                      <div class="mt-n4">
                        <p>{{ withCommas(sum(visibleChannels, knownCount)) }}</p>
                        <div class="font-weight-bold text-body-2">最小値</div>
                      </div>
                    </v-timeline-item>

                    <v-timeline-item icon="mdi-flag-checkered" dot-color="orange-darken-1">
                      <div class="mt-n4">
                        <p>{{ withCommas(getAverageSubscriberCount()) }}</p>
                        <div class="font-weight-bold text-body-2">平均値</div>
                      </div>
                    </v-timeline-item>

                    <v-timeline-item icon="mdi-flag-checkered" dot-color="red">
                      <div class="mt-n4">
                        <p>
                          {{
                            withCommas(sum(visibleChannels, (channel) => getMaxSubscriberCount(knownCount(channel))))
                          }}
                        </p>
                        <div class="font-weight-bold text-body-2">最大値</div>
                      </div>
                    </v-timeline-item>
                  </v-timeline>
                </v-card-text>
                <v-card-actions>
                  <v-spacer />

                  <v-btn text="閉じる" @click="isActive.value = false" />
                </v-card-actions>
              </v-card>
            </template>
          </v-dialog>
          合計
        </th>
        <td class="px-2">{{ withCommas(sum(visibleChannels, knownCount)) }}</td>
        <DifferenceValue
          class="px-2"
          :difference="totalPerHour"
          :strong="getStrong()"
          tag="td"
          v-if="type === 'subscriber'"
        />
        <DifferenceValue class="pl-2 pr-4" :difference="totalPerDay" :strong="getStrong()" tag="td" />
      </tr>
    </tfoot>
  </v-table>
</template>

<style lang="scss">
.v-table {
  th {
    white-space: nowrap;
  }

  table > tbody {
    > tr > th {
      position: relative;
    }

    > tr:hover > th::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      /* stylelint-disable-next-line color-function-notation */
      background: rgba(var(--v-border-color), var(--v-hover-opacity));
      pointer-events: none;
    }
  }
}

.channel {
  .channel-name span {
    background-color: transparent;
  }

  .channel-name-box {
    transition: transform 0.3s;
  }

  .channel-name-text {
    font-family: 'IBM Plex Sans JP', sans-serif;
    font-size: 125%;
    font-weight: bold;
    font-stretch: condensed;
    display: inline-block;
  }

  .live-badge {
    display: inline-block;
    position: absolute;
    z-index: 1;
    transition: transform 0.3s;
  }

  .has-live {
    color: white;
    font-size: 60%;
    background: red;
    border: 1px solid red;
    border-radius: 2px;
    padding: 0 2px;
    margin: auto 4px;
    left: 16px;
    top: 24px;

    &::before {
      content: 'LIVE';
    }
  }

  .has-live-to-start-soon {
    background: #ffb60c;
    border: 2px solid rgb(var(--v-theme-surface));
    border-radius: 100%;
    left: 23px;
    top: 26px;
    width: 12px;
    height: 12px;
  }

  .has-live-before-start {
    background: #1bb145;
    border: 2px solid rgb(var(--v-theme-surface));
    border-radius: 100%;
    left: 23px;
    top: 26px;
    width: 12px;
    height: 12px;
  }

  .avatar {
    border-width: 1.5px;
    transition: transform 0.3s;
  }

  &:hover {
    .channel-name-box,
    .live-badge {
      transform: translate(10px);
    }

    .avatar {
      transform: scale(1.5);
    }
  }
}
</style>
