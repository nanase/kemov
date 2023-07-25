type Markdown = string;

interface TuneAttribute {
  name: string;
  text: Markdown;
}

interface Tune {
  title: Markdown;
  originalTitle?: Markdown;
  attributes?: TuneAttribute[];
  description?: Markdown;
}

interface Video {
  id: string;
  title?: string;
  position?: number;
}

export interface Streaming {
  video: Video;
  name: string;
  shortname?: string;
  publishedAt: string;
  description?: Markdown;
  keywords?: string[];
  tunes: Tune[];
  categories?: string[];
  relatedVideos?: Video[];
}
