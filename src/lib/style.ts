export function url(url?: string | null): string {
  if (url == null) {
    return 'url("")';
  }

  return `url("${url.replaceAll('"', '%22')}")`;
}
