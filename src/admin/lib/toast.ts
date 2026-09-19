import { ref } from 'vue';

/**
 * The one-line result band after a button press (#144's handoff: "結果は
 * 押したあとの帯に一行で出す"). A single reactive value rather than one per
 * page: only one screen is ever visible at a time, and `AdminShell.vue`
 * mounts the single `.toast` element every page's actions write to.
 */
const message = ref<string | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const toastMessage = message;

export function showToast(text: string): void {
  message.value = text;

  if (hideTimer !== null) clearTimeout(hideTimer);

  hideTimer = setTimeout(() => {
    message.value = null;
  }, 2600);
}
