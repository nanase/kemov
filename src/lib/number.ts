// from: https://stackoverflow.com/a/2901298
export function withCommas(x?: number): string {
  if (x == null) {
    return '';
  }

  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
