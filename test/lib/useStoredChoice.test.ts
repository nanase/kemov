import { useStoredChoice } from '@/lib/useStoredChoice';

// This project's own test environment is plain node, with no `localStorage`
// global, so each test stands one up. Left unstubbed, the reference itself
// throws, which is one of the cases the composable has to survive.
function fakeLocalStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => void store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function throwingLocalStorage(): Storage {
  const fail = () => {
    throw new DOMException('denied', 'SecurityError');
  };

  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 };
}

const KEY = 'kemov/stats/metric';
const METRIC_IDS = ['subscriberCount', 'viewCount', 'streamCount'] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStoredChoice', () => {
  test('starts on the fallback when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());

    expect(useStoredChoice(KEY, METRIC_IDS, 'subscriberCount').value).toEqual('subscriberCount');
  });

  test('starts on what an earlier visit stored', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ [KEY]: 'viewCount' }));

    expect(useStoredChoice(KEY, METRIC_IDS, 'subscriberCount').value).toEqual('viewCount');
  });

  // The store keeps whatever it was given: an id this version dropped, a hand
  // edit, an empty string, a value that only looks like an allowed one.
  test.each([[''], ['gone'], ['ViewCount'], [' viewCount'], ['"viewCount"'], ['{"a":'], ['null'], ['undefined']])(
    'falls back for the stored value %j',
    (stored) => {
      vi.stubGlobal('localStorage', fakeLocalStorage({ [KEY]: stored }));

      expect(useStoredChoice(KEY, METRIC_IDS, 'subscriberCount').value).toEqual('subscriberCount');
    },
  );

  test('keeps a choice as plain text, the form these keys were first written in', () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('localStorage', storage);

    const metric = useStoredChoice(KEY, METRIC_IDS, 'subscriberCount');
    const step = useStoredChoice('kemov/stats/heatStep', [60, 30, 10, 1], 60);
    const activeOnly = useStoredChoice('kemov/stats/activeOnly', [false, true], false);

    metric.value = 'streamCount';
    step.value = 10;
    activeOnly.value = true;

    expect(storage.getItem(KEY)).toEqual('streamCount');
    expect(storage.getItem('kemov/stats/heatStep')).toEqual('10');
    expect(storage.getItem('kemov/stats/activeOnly')).toEqual('true');
  });

  test('reads a number or a boolean back as one', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ 'kemov/stats/heatStep': '30', 'kemov/stats/activeOnly': 'true' }));

    expect(useStoredChoice('kemov/stats/heatStep', [60, 30, 10, 1], 60).value).toBe(30);
    expect(useStoredChoice('kemov/stats/activeOnly', [false, true], false).value).toBe(true);
  });

  test.each([[''], ['0'], ['90'], ['30px'], ['30.0'], ['1e1']])('falls back for the stored step %j', (stored) => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ 'kemov/stats/heatStep': stored }));

    expect(useStoredChoice('kemov/stats/heatStep', [60, 30, 10, 1], 60).value).toBe(60);
  });

  test.each([[''], ['yes'], ['1'], ['True']])('falls back for the stored flag %j', (stored) => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ 'kemov/stats/activeOnly': stored }));

    expect(useStoredChoice('kemov/stats/activeOnly', [false, true], false).value).toBe(false);
  });

  test('runs on the fallback and holds a choice when localStorage throws', () => {
    vi.stubGlobal('localStorage', throwingLocalStorage());

    const metric = useStoredChoice(KEY, METRIC_IDS, 'subscriberCount');

    expect(metric.value).toEqual('subscriberCount');

    metric.value = 'viewCount';

    expect(metric.value).toEqual('viewCount');
  });

  test('runs on the fallback when there is no localStorage at all', () => {
    const metric = useStoredChoice(KEY, METRIC_IDS, 'subscriberCount');

    metric.value = 'viewCount';

    expect(metric.value).toEqual('viewCount');
  });

  test('keeps a choice made after storage refused an earlier write', () => {
    const storage = fakeLocalStorage();
    let refuse = true;
    vi.stubGlobal('localStorage', {
      ...storage,
      getItem: storage.getItem,
      setItem: (key: string, value: string) => {
        if (refuse) throw new DOMException('full', 'QuotaExceededError');
        storage.setItem(key, value);
      },
    });

    const metric = useStoredChoice(KEY, METRIC_IDS, 'subscriberCount');

    metric.value = 'viewCount';
    refuse = false;
    metric.value = 'streamCount';

    expect(storage.getItem(KEY)).toEqual('streamCount');
  });
});
