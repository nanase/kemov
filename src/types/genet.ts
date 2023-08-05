type Markdown = string;

export type VideoType = 'video' | 'live' | 'short';

interface Video {
  id: string;
  title?: string;
  publishedAt: string;
  type: VideoType;
  variety?: boolean;
}

interface EmbeddedVideo {
  id: string;
  title?: string;
  position?: number;
  description?: string;
}

interface TuneAttribute {
  name: string;
  text: Markdown;
}

interface TuneReference {
  link: string;
  title: string;
}

interface Tune {
  title: Markdown;
  subtunes?: Markdown[];
  originalTitle?: Markdown;
  attributes?: TuneAttribute[];
  description?: Markdown;
  videos?: EmbeddedVideo[];
  references?: TuneReference[];
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
