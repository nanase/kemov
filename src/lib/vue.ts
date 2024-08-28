import { onMounted, onBeforeUnmount, type Ref, watch } from 'vue';

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

interface StorageOptions {
  type: 'local' | 'session';
  readable: boolean;
  writable: boolean;
  immediate: boolean;
}

export function storage<T>(value: Ref<T>, key: string, options?: Partial<StorageOptions>) {
  const storage = (options?.type ?? 'local') === 'local' ? localStorage : sessionStorage;

  const save = () => {
    if (typeof value.value !== 'undefined') {
      storage.setItem(key, JSON.stringify(value.value));
    }
  };
  const load = () => {
    const data = storage.getItem(key);

    if (data != null) {
      value.value = JSON.parse(data);
    }
  };

  if ((options?.immediate ?? true) && (options?.readable ?? true)) {
    load();
  }

  if (options?.writable ?? true) {
    watch(() => value.value, save, {
      immediate: options?.immediate ?? true,
    });
  }

  return {
    remove: () => {
      storage.removeItem(key);
    },
    save,
    load,
  };
}
