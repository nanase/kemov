export function findBy<K extends PropertyKey, T extends Record<K, any>, ValueType>(
  key: K,
  value: ValueType,
  array: Array<T>,
): T | null {
  for (const element of array) {
    if (typeof element[key] === 'undefined') continue;
    if (element[key] === value) return element;
  }
  return null;
}

export function mergeArrayBy<K extends PropertyKey, T1 extends Record<K, any>, T2 extends Record<K, any>>(
  key: K,
  array1: T1[],
  array2: T2[],
): Array<T1 & T2> {
  return array1
    .map((element) => {
      const obj1 = findBy(key, element[key], array1);
      const obj2 = findBy(key, element[key], array2);

      if (obj1 == null || obj2 == null) return null;

      return { ...obj1, ...obj2 };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

export function sum<T>(array: T[] | null, value: (element: T) => number): number {
  if (array == null) {
    return 0;
  }

  return array.reduce((prev, element) => prev + value(element), 0);
}
