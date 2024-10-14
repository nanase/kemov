import { computed, ref, type ComputedRef, type Ref } from 'vue';

type TimeoutIdType = ReturnType<typeof setTimeout>;

interface UseIntervalActionReturn {
  invoke: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  error: Ref<any>;
  errorOccurred: ComputedRef<boolean>;
}

export function useIntervalAction(
  initialInterval: number | (() => number),
  action: () => Promise<number | void>,
  errorAction?: (error: unknown) => Promise<number | void>,
): UseIntervalActionReturn {
  let timeoutId: TimeoutIdType | undefined = undefined;
  const error = ref<any>();
  const interval = ref<number>(typeof initialInterval === 'number' ? initialInterval : initialInterval());

  async function invoke() {
    try {
      error.value = undefined;
      const newInterval = await action();

      if (typeof newInterval === 'number') {
        interval.value = newInterval;
      }
    } catch (e) {
      error.value = e;
      await errorAction?.(e);
    }
  }

  async function start() {
    if (typeof timeoutId !== 'undefined') {
      return;
    }

    await invoke();

    timeoutId = setTimeout(async () => {
      timeoutId = undefined;
      await start();
    }, interval.value);
  }

  function stop() {
    if (typeof timeoutId !== 'undefined') {
      clearInterval(timeoutId);
      timeoutId = undefined;
    }
  }

  return {
    invoke,
    start,
    stop,
    error,
    errorOccurred: computed<boolean>(() => typeof error.value !== 'undefined'),
  };
}
