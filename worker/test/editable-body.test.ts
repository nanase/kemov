import { readEditableBody } from '../src/lib/editable-body';

const KEYS = ['a', 'b'] as const;

describe('readEditableBody', () => {
  test('refuses a key that is not in the allow-list', async () => {
    const result = readEditableBody({ a: '1', b: '2', c: '3' }, KEYS, () => null);

    expect('error' in result).toEqual(true);
    if ('error' in result) {
      expect(result.error.status).toEqual(400);
      expect(await result.error.json()).toEqual({ error: 'c cannot be saved' });
    }
  });

  test('treats a key the body leaves out as null', () => {
    const result = readEditableBody({ a: '1' }, KEYS, () => null);

    expect('values' in result && result.values).toEqual({ a: '1', b: null });
  });

  test('refuses the first field a validator objects to, without checking the rest', () => {
    const seen: string[] = [];
    const result = readEditableBody({ a: '1', b: '2' }, KEYS, (key) => {
      seen.push(key);

      return key === 'a' ? 'a is wrong' : null;
    });

    expect('error' in result).toEqual(true);
    expect(seen).toEqual(['a']);
  });
});
