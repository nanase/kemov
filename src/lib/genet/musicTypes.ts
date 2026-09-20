/**
 * `GET /api/genet/music`'s own shape (#139, #144) - built by
 * `worker/src/admin/genet-publish.ts`'s `publishGenetMusicNow`, from
 * `publicShapeOf` in `worker/src/admin/genet-{tunes,streams,people}.ts`.
 * snake_case throughout, matching the worker's own JSON - unlike
 * `src/type/genet/music.ts` (the old page's streaming.yml-shaped type),
 * this is the real published shape.
 */

export type GenetPlatform = 'youtube' | 'tiktok';
export type GenetVideoType = 'live' | 'video' | 'short';
export type GenetSceneStyle = 'play' | 'sing' | 'bgm' | 'talk';

export interface GenetPerson {
  person_id: number;
  name: string;
  link: string | null;
}

export interface GenetAttributePerson {
  person_id: number;
  credited_as: string | null;
  note: string | null;
}

export interface GenetAttribute {
  name: string | null;
  text: string | null;
  people: GenetAttributePerson[];
}

export interface GenetTuneVideo {
  video_id: string;
  title: string;
  start_seconds: number | null;
  description: string | null;
}

export interface GenetTuneScore {
  url: string;
  title: string;
}

export interface GenetTune {
  tune_id: number;
  title: string;
  original_title: string | null;
  subtunes: string[];
  attributes: GenetAttribute[];
  videos: GenetTuneVideo[];
  scores: GenetTuneScore[];
}

export interface GenetScene {
  style: GenetSceneStyle;
  video_id: string;
  start_seconds: number | null;
}

export interface GenetPerformance {
  tune_id: number;
  description: string | null;
  scenes: GenetScene[];
}

export interface GenetStream {
  video_id: string;
  platform: GenetPlatform;
  url: string | null;
  video_type: GenetVideoType;
  title: string;
  short_title: string | null;
  published_at: string;
  categories: string[];
  keywords: string[];
  performances: GenetPerformance[];
}

export interface GenetMusicData {
  published_at: string;
  streams: GenetStream[];
  tunes: GenetTune[];
  people: GenetPerson[];
}
