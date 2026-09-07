import { computed, ref, type ComputedRef, type Ref } from 'vue';

type TimeoutIdType = ReturnType<typeof setTimeout>;

interface UseIntervalActionReturn {
  invoke: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  error: Ref<unknown>;
  errorOccurred: ComputedRef<boolean>;
}

export function useIntervalAction(
  initialInterval: number | (() => number),
  action: () => Promise<number | void>,
  errorAction?: (error: unknown) => Promise<number | void>,
): UseIntervalActionReturn {
  let timeoutId: TimeoutIdType | undefined = undefined;
  const error = ref<unknown>();
  const interval = ref<number>(typeof initialInterval === 'number' ? initialInterval : initialInterval());

  async function invoke() {
    try {
      error.value = undefined;

      applyInterval(await action());
    } catch (e) {
      error.value = e;

      // The number errorAction returns is how long to wait before trying
      // again, and it was being discarded. A first call that failed left the
      // interval at its initial value, which for the statistics store is one
      // second - so a failing API was asked again every second, by every open
      // tab, for as long as it stayed down.
      applyInterval(await errorAction?.(e));
    }
  }

  function applyInterval(next: number | void): void {
    if (typeof next === 'number') {
      interval.value = next;
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
