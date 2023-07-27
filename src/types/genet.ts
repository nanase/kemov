type Markdown = string;

export type VideoType = 'video' | 'live' | 'short';

interface Video {
  id: string;
  title?: string;
  position?: number;
  publishedAt: string;
  type: VideoType;
}

interface TuneAttribute {
  name: string;
  text: Markdown;
}

interface Tune {
  title: Markdown;
  originalTitle?: Markdown;
  attributes?: TuneAttribute[];
  description?: Markdown;
  videos?: Video[];
}

export interface Streaming {
  video: Video;
  name: string;
  shortname?: string;
  description?: Markdown;
  keywords?: string[];
  tunes: Tune[];
  categories?: string[];
}
