export function withCommas(x?: number): string | undefined {
  return x?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
