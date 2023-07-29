type Markdown = string;

export type VideoType = 'video' | 'live' | 'short';

interface Video {
  id: string;
  title?: string;
  publishedAt: string;
  type: VideoType;
}

interface EmbeddedVideo {
  id: string;
  title?: string;
  position?: number;
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
  videos?: EmbeddedVideo[];
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
