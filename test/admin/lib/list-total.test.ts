import { useListTotal } from '@/admin/lib/list-total';

/** A `readTotal` whose answers the test hands out one at a time. */
function controlledReads(): {
  read: () => Promise<number>;
  calls: () => number;
  answer: (n: number) => void;
  fail: () => void;
} {
  const waiting: { resolve: (n: number) => void; reject: (e: Error) => void }[] = [];

  return {
    read: () => new Promise<number>((resolve, reject) => waiting.push({ resolve, reject })),
    calls: () => waiting.length,
    answer: (n) => waiting.shift()!.resolve(n),
    fail: () => waiting.shift()!.reject(new Error('failed')),
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('useListTotal', () => {
  it('takes an unfiltered list as the whole list, without reading again', () => {
    const reads = controlledReads();
    const { total, update } = useListTotal(reads.read);

    update(40, false);

    expect(total.value).toBe(40);
    expect(reads.calls()).toBe(0);
  });

  it('reads the whole list once while filtered, not on every load', async () => {
    const reads = controlledReads();
    const { total, update } = useListTotal(reads.read);

    update(12, true);
    expect(total.value).toBeNull();

    reads.answer(40);
    await settle();
    update(5, true);

    expect(total.value).toBe(40);
    expect(reads.calls()).toBe(0);
  });

  it('does not start a second read while the first is on its way', async () => {
    const reads = controlledReads();
    const { total, update } = useListTotal(reads.read);

    update(12, true);
    update(3, true);
    update(1, true);

    expect(reads.calls()).toBe(1);

    reads.answer(40);
    await settle();

    expect(total.value).toBe(40);
  });

  it('reads again when invalidated while a read was on its way', async () => {
    const reads = controlledReads();
    const { total, update, invalidate } = useListTotal(reads.read);

    update(12, true);
    invalidate();
    reads.answer(40);
    await settle();
    update(12, true);

    expect(reads.calls()).toBe(1);

    reads.answer(41);
    await settle();

    expect(total.value).toBe(41);
  });

  it('reads again after invalidate', async () => {
    const reads = controlledReads();
    const { total, update, invalidate } = useListTotal(reads.read);

    update(40, false);
    invalidate();
    update(12, true);
    reads.answer(39);
    await settle();

    expect(total.value).toBe(39);
  });

  it('knows nothing after a failed read, and tries again on the next load', async () => {
    const reads = controlledReads();
    const { total, update } = useListTotal(reads.read);

    update(12, true);
    reads.fail();
    await settle();

    expect(total.value).toBeNull();

    update(12, true);
    reads.answer(40);
    await settle();

    expect(total.value).toBe(40);
  });

  it('lets an unfiltered load win over a read still on its way', async () => {
    const reads = controlledReads();
    const { total, update } = useListTotal(reads.read);

    update(12, true);
    update(41, false);
    reads.answer(40);
    await settle();

    expect(total.value).toBe(41);
  });
});
