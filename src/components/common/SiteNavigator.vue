<script setup lang="ts">
import { ref } from 'vue';

const navigatorOpened = ref<boolean>(false);
</script>

<template>
  <Teleport to="body">
    <div class="navi-button" v-if="!navigatorOpened" @click="navigatorOpened = true"></div>
  </Teleport>
  <Teleport to="body">
    <Transition name="site-backscreen">
      <div class="site-backscreen" v-if="navigatorOpened" @click="navigatorOpened = false"></div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <Transition name="site-navigator">
      <div class="site-navigator" v-if="navigatorOpened">
        <div class="closer" @click="navigatorOpened = false"></div>
        <div class="content">
          <div class="item">
            <a
              class="item-icon"
              href="/kemov/stats/"
              style="background-image: url('/kemov/common/chart_line_line.svg')"
            ></a>
            <a class="item-text" href="/kemov/stats/">リアルタイム統計</a>
          </div>
          <div class="item">
            <a
              class="item-icon"
              href="/kemov/genet/music/"
              style="background-image: url('/kemov/common/music_line.svg')"
            ></a>
            <a class="item-text" href="/kemov/genet/music/">ジェネットの配信で紹介された楽曲一覧</a>
          </div>
        </div>
        <a class="footer" href="/" target="_blank">Lazuli</a>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss">
.navi-button {
  position: fixed;
  left: 0;
  top: 0;
  cursor: pointer;
  margin: 10px;
  width: 28px;
  height: 28px;
  background-repeat: no-repeat;
  background-position: center center;
  background-size: 28px 28px;
  background-image: url('/common/menu_line.svg');
}

.site-backscreen {
  position: fixed;
  left: 0;
  top: 0;
  background-color: #00000040;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(1px);

  &-enter-active,
  &-leave-active {
    transition: opacity 0.1s ease;
  }

  &-enter-from,
  &-leave-to {
    opacity: 0;
  }
}

.site-navigator {
  display: flex;
  flex-flow: column;
  position: fixed;
  left: 0;
  top: 0;
  background-color: #fffffff0;
  width: 240px;
  height: 100%;
  backdrop-filter: blur(1px) brightness(1.1);
  border-right: 1px solid #333;
  font-size: 16px;
  user-select: none;

  &-enter-active,
  &-leave-active {
    transition: left 0.2s ease;
  }

  &-enter-from,
  &-leave-to {
    left: -240px;
  }

  .closer {
    cursor: pointer;
    margin: 10px;
    width: 24px;
    height: 24px;
    background-repeat: no-repeat;
    background-position: center center;
    background-size: 24px 24px;
    background-image: url('/common/close_line.svg');
  }

  .content {
    flex: 1;
    overflow: auto;
    margin: 10px;

    .item {
      display: inline-flex;
      margin: 10px 0;
      cursor: pointer;
    }

    .item-icon {
      width: 24px;
      height: 24px;
      margin: 0 5px;
      background-repeat: no-repeat;
      background-position: center center;
      background-size: 24px 24px;
      transition: transform 0.2s;
    }

    .item:hover .item-icon {
      transform: scale(1.3);
    }

    .item-text {
      flex: fit-content;
      text-decoration: none;
    }
  }

  .footer {
    display: block;
    padding-left: 29px;
    margin: 10px;
    background-repeat: no-repeat;
    background-position: 0 -2px;
    background-size: 24px 24px;
    background-image: url('/common/logo_white.svg');
    color: #aaa;
    font-weight: bold;
    font-size: 16px;
    text-decoration: inherit;
  }
}
</style>
