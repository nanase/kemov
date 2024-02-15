import { onMounted, onBeforeUnmount } from 'vue';

export function definePeriodicCall(
  onCalled: () => Promise<number | undefined>,
  onError?: (error: any) => Promise<number | undefined>,
): void {
  let intervalObj: number;
  let waitTime: number | undefined;

  const callee = async function () {
    try {
      waitTime = await onCalled();

      if (typeof waitTime !== 'undefined') {
        intervalObj = setTimeout(callee, waitTime * 1000);
      }
    } catch (ex) {
      if (onError) {
        waitTime = await onError(ex);

        if (typeof waitTime !== 'undefined') {
          intervalObj = setTimeout(callee, waitTime * 1000);
        }
      }
    }
  };

  onMounted(async () => {
    await callee();
  });

  onBeforeUnmount(() => {
    clearInterval(intervalObj);
  });
}
