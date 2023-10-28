<script setup lang="ts">
import { ref } from 'vue';

import { withCommas } from '@/lib/number';
import { JST } from '@/lib/date';
import { type Video } from '@/misc/types';

import VideoThumbnail from './VideoThumbnail.vue';

const { video } = defineProps<{
  video: Video;
}>();

const dialog = ref<boolean>();
</script>

<template>
  <v-dialog v-model="dialog" activator="parent" max-width="1200">
    <v-card>
      <v-container>
        <v-row>
          <v-col cols="12" sm="6">
            <VideoThumbnail :videoId="video.videoId" size="max" link style="width: 100%"></VideoThumbnail>
            <div class="mb-2 text-h6 font-weight-bold">
              {{ video.title }}
            </div>
            <div class="font-weight-bold">
              {{ video.duration?.format('H:mm:ss') }} - {{ JST(video.publishedAt).format('YYYY/MM/DD HH:mm:ss') }} 公開
            </div>
            <div>ID: {{ video.videoId }} - {{ video.type }}</div>
            <div>{{ JST(video.fetchedAt).format('YYYY/MM/DD HH:mm:ss') }} 情報取得</div>
          </v-col>
          <v-col cols="12" sm="6">
            <v-container>
              <v-row>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card color="indigo" variant="outlined" class="summary-card">
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-play"></v-icon>
                      再生数
                    </v-card-text>
                    <v-card-text class="py-2 mt-n3 text-h6 text-right">
                      {{ withCommas(video.viewCount ?? 0) }}
                      <span class="text-subtitle-2">回</span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card color="orange-darken-1" variant="outlined" class="summary-card">
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-thumb-up"></v-icon>
                      高評価数
                    </v-card-text>
                    <v-card-text class="pa-2 mt-n3 text-h6 text-right">
                      {{ withCommas(video.likeCount ?? 0) }}
                      <span class="text-subtitle-2">&nbsp;</span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card color="deep-purple-lighten-3" variant="outlined" class="summary-card">
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-comment"></v-icon>
                      コメント数
                    </v-card-text>
                    <v-card-text class="py-2 mt-n3 text-h6 text-right">
                      {{ withCommas(video.commentCount ?? 0) }}
                      <span class="text-subtitle-2">個</span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card
                    color="red"
                    variant="outlined"
                    class="summary-card"
                    :disabled="(video.chatMessageCount ?? 0) === 0"
                  >
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-chat"></v-icon>
                      チャット数
                    </v-card-text>
                    <v-card-text class="py-2 mt-n3 text-h6 text-right">
                      {{ withCommas(video.chatMessageCount) }}
                      <span class="text-subtitle-2"></span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card
                    color="teal"
                    variant="outlined"
                    class="summary-card"
                    :disabled="(video.chatUniqueUserCount ?? 0) === 0"
                  >
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-account-multiple"></v-icon>
                      チャットユーザ数
                    </v-card-text>
                    <v-card-text class="pa-2 mt-n3 text-h6 text-right">
                      {{ withCommas(video.chatUniqueUserCount) }}
                      <span class="text-subtitle-2">&nbsp;</span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card
                    color="blue"
                    variant="outlined"
                    class="summary-card"
                    :disabled="video.scheduledStartTime == null"
                  >
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-calendar"></v-icon>
                      配信開始予定日時
                    </v-card-text>
                    <v-card-text class="py-2 mt-n3 text-body-2 text-right">
                      {{
                        video.scheduledStartTime ? JST(video.scheduledStartTime).format('YYYY/MM/DD HH:mm:ss') : 'なし'
                      }}
                      <span class="text-subtitle-2"></span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card
                    color="blue"
                    variant="outlined"
                    class="summary-card"
                    :disabled="video.actualStartTime == null"
                  >
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-calendar-start"></v-icon>
                      配信開始日時
                    </v-card-text>
                    <v-card-text class="py-2 mt-n3 text-body-2 text-right">
                      {{ video.actualStartTime ? JST(video.actualStartTime).format('YYYY/MM/DD HH:mm:ss') : 'なし' }}
                      <span class="text-subtitle-2"></span>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="12" md="6" class="pa-1">
                  <v-card color="blue" variant="outlined" class="summary-card" :disabled="video.actualEndTime == null">
                    <v-card-text class="pa-2 text-subtitle-2">
                      <v-icon icon="mdi-calendar-end"></v-icon>
                      配信終了日時
                    </v-card-text>
                    <v-card-text class="py-2 mt-n3 text-body-2 text-right">
                      {{ video.actualEndTime ? JST(video.actualEndTime).format('YYYY/MM/DD HH:mm:ss') : 'なし' }}
                      <span class="text-subtitle-2"></span>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-container>
          </v-col>
        </v-row>
      </v-container>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="green-darken-1" variant="text" @click="dialog = false">閉じる</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
