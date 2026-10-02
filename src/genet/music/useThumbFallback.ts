import { ref } from 'vue';

import { relayVideoThumbnailURL } from '@/lib/relay';

/** A video's thumbnail through the relay, at the size asked for. */
export function thumbSrc(videoId: string, size: 'mq' | 'hq' | 'max' = 'mq'): string {
  return relayVideoThumbnailURL(videoId, size);
}

/**
 * Videos whose thumbnail did not arrive even at `hq`. Their `<img>` is
 * replaced by `ThumbnailFallback` (#180): the step down to `hq` in `onError`
 * is the only retry, so a failure after it is final for this page.
 *
 * An `<img>` handled here carries its video in `data-video-id`.
 */
export function useThumbFallback() {
  const failed = ref<ReadonlySet<string>>(new Set());

  function onError(event: Event): void {
    const img = event.target as HTMLImageElement;
    const videoId = img.dataset.videoId ?? '';

    if (img.dataset.fallback) {
      failed.value = new Set(failed.value).add(videoId);

      return;
    }

    img.dataset.fallback = '1';
    img.src = thumbSrc(videoId, 'hq');
  }

  return { failed, onError };
}
