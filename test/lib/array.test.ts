import { findBy, mergeArrayBy } from '../../src/lib/array';

describe('findBy', () => {
  test('find object', () => {
    const array = [
      { id: 27, name: 'Ken' },
      { id: 32, name: 'John' },
    ];

    expect(findBy('id', 27, array)).toEqual({ id: 27, name: 'Ken' });
  });

  test('find object but key is any', () => {
    const obj: any = { hello: 'world' };
    const array = [
      { [obj]: 27, name: 'Ken' },
      { [obj]: 32, name: 'John' },
    ];

    expect(findBy(obj, 27, array)).toEqual({ [obj]: 27, name: 'Ken' });
  });

  test('find in mismatch object', () => {
    const array = [
      { id: 27, name: 'Ken' },
      { id: 32, name: 'John' },
    ];

    expect(findBy('id', 42, array)).toBeNull();
  });

  test('find in empty object', () => {
    const array: Record<string, number>[] = [];

    expect(findBy('id', 42, array)).toBeNull();
  });
});

describe('mergeArrayBy', () => {
  test('merge another array', () => {
    const array1 = [
      { id: 27, name: 'Ken' },
      { id: 32, name: 'John' },
    ];
    const array2 = [
      { id: 27, age: 33 },
      { id: 32, age: 42 },
    ];

    expect(mergeArrayBy('id', array1, array2)).toEqual([
      { id: 27, name: 'Ken', age: 33 },
      { id: 32, name: 'John', age: 42 },
    ]);
  });

  test('merge mismatch array', () => {
    const array1 = [
      { id: 27, name: 'Ken' },
      { id: 32, name: 'John' },
    ];
    const array2 = [
      { id: 270, age: 33 },
      { id: 320, age: 42 },
    ];

    expect(mergeArrayBy('id', array1, array2)).toEqual([]);
  });
});
