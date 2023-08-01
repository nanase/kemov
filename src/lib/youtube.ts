type ThumbnailSize = 'default' | 'mq' | 'hq' | 'sd' | 'max';
type ThumbnailServer = 'main' | 'i' | 'i1' | 'i2' | 'i3' | 'i4';

function getThumbnailSizeName(size: ThumbnailSize) {
  switch (size) {
    case 'default':
      return 'default';
    case 'mq':
      return 'mqdefault';
    case 'hq':
      return 'hqdefault';
    case 'sd':
      return 'sddefault';
    case 'max':
      return 'maxresdefault';
  }
}

function getThumbnailServerDomain(server: ThumbnailServer): string {
  switch (server) {
    case 'main':
      return 'img.youtube.com';
    case 'i':
      return 'i.ytimg.com';
    case 'i1':
      return 'i1.ytimg.com';
    case 'i2':
      return 'i2.ytimg.com';
    case 'i3':
      return 'i3.ytimg.com';
    case 'i4':
      return 'i4.ytimg.com';
  }
}

function getThumbnailSize(width: number): ThumbnailSize {
  if (width >= 1280) {
    return 'max';
  }
  if (width >= 640) {
    return 'sd';
  }
  if (width >= 480) {
    return 'hq';
  }
  if (width >= 320) {
    return 'mq';
  }

  return 'default';
}

interface ThumbnailURLOptions {
  size?: ThumbnailSize;
  server?: ThumbnailServer;
  width?: number;
}

export function getThumbnailURL(videoId: string, options: ThumbnailURLOptions = {}): string {
  const server = options.server ?? 'i';
  const size = options.size ?? getThumbnailSize(options.width ?? 480);

  return `//${getThumbnailServerDomain(server)}/vi/${videoId}/${getThumbnailSizeName(size)}.jpg`;
}

export function getWatchURL(videoId: string) {
  return `//www.youtube.com/watch?v=${videoId}`;
}

export function getEmbedURL(videoId: string, nocookie: boolean = true) {
  return nocookie ? `//www.youtube-nocookie.com/embed/${videoId}` : `//www.youtube.com/embed/${videoId}`;
}
