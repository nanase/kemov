import { useIntervalAction } from '@/lib/useIntervalAction';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('invoke', () => {
  test('runs the action and reports no error', async () => {
    const action = vi.fn(async () => {});
    const { invoke, error, errorOccurred } = useIntervalAction(1000, action);

    await invoke();

    expect(action).toHaveBeenCalledOnce();
    expect(error.value).toBeUndefined();
    expect(errorOccurred.value).toBe(false);
  });

  test('records a thrown error and passes it to errorAction', async () => {
    const thrown = new Error('boom');
    const errorAction = vi.fn(async () => {});
    const { invoke, error, errorOccurred } = useIntervalAction(
      1000,
      async () => {
        throw thrown;
      },
      errorAction,
    );

    await invoke();

    expect(error.value).toBe(thrown);
    expect(errorOccurred.value).toBe(true);
    expect(errorAction).toHaveBeenCalledWith(thrown);
  });

  test('a later success clears the previous error', async () => {
    let shouldThrow = true;
    const { invoke, error, errorOccurred } = useIntervalAction(1000, async () => {
      if (shouldThrow) {
        throw new Error('boom');
      }
    });

    await invoke();
    expect(errorOccurred.value).toBe(true);

    shouldThrow = false;
    await invoke();

    expect(error.value).toBeUndefined();
    expect(errorOccurred.value).toBe(false);
  });

  test('survives a throwing errorAction being absent', async () => {
    const { invoke, errorOccurred } = useIntervalAction(1000, async () => {
      throw new Error('boom');
    });

    await expect(invoke()).resolves.toBeUndefined();
    expect(errorOccurred.value).toBe(true);
  });
});

describe('start', () => {
  test('runs immediately, then again after the initial interval', async () => {
    const action = vi.fn(async () => {});
    const { start, stop } = useIntervalAction(1000, action);

    await start();
    expect(action).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(999);
    expect(action).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(action).toHaveBeenCalledTimes(2);

    stop();
  });

  test('accepts the initial interval as a function', async () => {
    const action = vi.fn(async () => {});
    const { start, stop } = useIntervalAction(() => 2000, action);

    await start();
    await vi.advanceTimersByTimeAsync(1999);
    expect(action).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(action).toHaveBeenCalledTimes(2);

    stop();
  });

  test('a number returned by the action becomes the next interval', async () => {
    const action = vi.fn(async () => 5000);
    const { start, stop } = useIntervalAction(1000, action);

    await start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(action).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(4000);
    expect(action).toHaveBeenCalledTimes(2);

    stop();
  });

  test('starting again while a run is pending does nothing', async () => {
    const action = vi.fn(async () => {});
    const { start, stop } = useIntervalAction(1000, action);

    await start();
    await start();

    expect(action).toHaveBeenCalledOnce();

    stop();
  });
});

describe('stop', () => {
  test('cancels the scheduled run', async () => {
    const action = vi.fn(async () => {});
    const { start, stop } = useIntervalAction(1000, action);

    await start();
    stop();

    await vi.advanceTimersByTimeAsync(5000);

    expect(action).toHaveBeenCalledOnce();
  });

  test('is safe to call without having started', () => {
    const { stop } = useIntervalAction(1000, async () => {});

    expect(() => stop()).not.toThrow();
  });

  test('a stopped action can be started again', async () => {
    const action = vi.fn(async () => {});
    const { start, stop } = useIntervalAction(1000, action);

    await start();
    stop();
    await start();

    expect(action).toHaveBeenCalledTimes(2);

    stop();
  });
});
