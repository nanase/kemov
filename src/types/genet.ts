export type Markdown = string;

export type VideoType = 'video' | 'live' | 'short';

export interface VideoBase {
  id: string;
  title?: string;
}

export interface Video extends VideoBase {
  publishedAt: string;
  type: VideoType;
  variety?: boolean;
}

export interface EmbeddedVideo extends VideoBase {
  position?: number;
  description?: string;
}

export interface TuneAttribute {
  name: string;
  text: Markdown;
  noSeparator?: boolean;
}

export interface TuneReference {
  link: string;
  title: string;
}

export interface Tune {
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
  notes?: string[];
}
