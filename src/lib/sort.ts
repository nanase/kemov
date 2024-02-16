export type SortOrder = 'ascending' | 'descending';

export function compareWithNull<T>(a: T | undefined | null, b: T | undefined | null, order?: SortOrder): number {
  if (a !== a && b !== b) return 0;
  if (a !== a) return 1;
  if (b !== b) return -1;

  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (a < b) {
    return order === 'descending' ? 1 : -1;
  } else if (a > b) {
    return order === 'descending' ? -1 : 1;
  } else {
    return 0;
  }
}
