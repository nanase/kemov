import { field, readEach, readInstant, readNumber, readOneOf, readOrNull, readString } from '@/lib/read';

import type {
  GenetAttribute,
  GenetAttributePerson,
  GenetMusicData,
  GenetPerformance,
  GenetPerson,
  GenetScene,
  GenetStream,
  GenetTune,
  GenetTuneScore,
  GenetTuneVideo,
} from './musicTypes';

/**
 * Readers for `GET /api/genet/music`, which turn a body into `GenetMusicData`
 * or throw a `ShapeError` naming the field that did not fit.
 *
 * Every field the page draws is read, to the same depth as the readers in
 * `src/type/api.ts`. The enumerations below are the ones the page switches on;
 * they are listed here rather than derived from `musicTypes.ts` because a type
 * cannot be checked against a body at run time.
 */

const PLATFORMS = ['youtube', 'tiktok'] as const;
const VIDEO_TYPES = ['live', 'video', 'short'] as const;
const SCENE_STYLES = ['play', 'sing', 'bgm', 'talk'] as const;

function readStringOrNull(value: unknown, path: string): string | null {
  return readOrNull(value, path, readString);
}

function readPerson(value: unknown, path: string): GenetPerson {
  return {
    person_id: readNumber(field(value, 'person_id', path), `${path}.person_id`),
    name: readString(field(value, 'name', path), `${path}.name`),
    link: readStringOrNull(field(value, 'link', path), `${path}.link`),
  };
}

function readAttributePerson(value: unknown, path: string): GenetAttributePerson {
  return {
    person_id: readNumber(field(value, 'person_id', path), `${path}.person_id`),
    credited_as: readStringOrNull(field(value, 'credited_as', path), `${path}.credited_as`),
    note: readStringOrNull(field(value, 'note', path), `${path}.note`),
  };
}

function readAttribute(value: unknown, path: string): GenetAttribute {
  return {
    name: readStringOrNull(field(value, 'name', path), `${path}.name`),
    text: readStringOrNull(field(value, 'text', path), `${path}.text`),
    people: readEach(field(value, 'people', path), `${path}.people`, readAttributePerson),
  };
}

function readTuneVideo(value: unknown, path: string): GenetTuneVideo {
  return {
    video_id: readString(field(value, 'video_id', path), `${path}.video_id`),
    title: readString(field(value, 'title', path), `${path}.title`),
    start_seconds: readOrNull(field(value, 'start_seconds', path), `${path}.start_seconds`, readNumber),
    description: readStringOrNull(field(value, 'description', path), `${path}.description`),
  };
}

function readTuneScore(value: unknown, path: string): GenetTuneScore {
  return {
    url: readString(field(value, 'url', path), `${path}.url`),
    title: readString(field(value, 'title', path), `${path}.title`),
  };
}

function readTune(value: unknown, path: string): GenetTune {
  return {
    tune_id: readNumber(field(value, 'tune_id', path), `${path}.tune_id`),
    title: readString(field(value, 'title', path), `${path}.title`),
    original_title: readStringOrNull(field(value, 'original_title', path), `${path}.original_title`),
    subtunes: readEach(field(value, 'subtunes', path), `${path}.subtunes`, readString),
    attributes: readEach(field(value, 'attributes', path), `${path}.attributes`, readAttribute),
    videos: readEach(field(value, 'videos', path), `${path}.videos`, readTuneVideo),
    scores: readEach(field(value, 'scores', path), `${path}.scores`, readTuneScore),
  };
}

function readScene(value: unknown, path: string): GenetScene {
  return {
    style: readOneOf(field(value, 'style', path), `${path}.style`, SCENE_STYLES),
    video_id: readString(field(value, 'video_id', path), `${path}.video_id`),
    start_seconds: readOrNull(field(value, 'start_seconds', path), `${path}.start_seconds`, readNumber),
  };
}

function readPerformance(value: unknown, path: string): GenetPerformance {
  return {
    tune_id: readNumber(field(value, 'tune_id', path), `${path}.tune_id`),
    description: readStringOrNull(field(value, 'description', path), `${path}.description`),
    scenes: readEach(field(value, 'scenes', path), `${path}.scenes`, readScene),
  };
}

function readStream(value: unknown, path: string): GenetStream {
  return {
    video_id: readString(field(value, 'video_id', path), `${path}.video_id`),
    platform: readOneOf(field(value, 'platform', path), `${path}.platform`, PLATFORMS),
    url: readStringOrNull(field(value, 'url', path), `${path}.url`),
    video_type: readOneOf(field(value, 'video_type', path), `${path}.video_type`, VIDEO_TYPES),
    title: readString(field(value, 'title', path), `${path}.title`),
    short_title: readStringOrNull(field(value, 'short_title', path), `${path}.short_title`),
    published_at: readInstant(field(value, 'published_at', path), `${path}.published_at`),
    categories: readEach(field(value, 'categories', path), `${path}.categories`, readString),
    keywords: readEach(field(value, 'keywords', path), `${path}.keywords`, readString),
    performances: readEach(field(value, 'performances', path), `${path}.performances`, readPerformance),
  };
}

/**
 * The whole body.
 *
 * `channel_id` and `shape_version` are absent from a JSON published before
 * they existed (`shape_version` 1), and `channel_id` is `null` when the streams
 * do not point at one channel (#184). The page treats absent and `null` the
 * same, so both read as `null` here.
 */
export function readGenetMusicData(value: unknown): GenetMusicData {
  const path = 'body';

  return {
    published_at: readInstant(field(value, 'published_at', path), `${path}.published_at`),
    channel_id: readStringOrNull(field(value, 'channel_id', path), `${path}.channel_id`),
    shape_version: readOrNull(field(value, 'shape_version', path), `${path}.shape_version`, readNumber) ?? undefined,
    streams: readEach(field(value, 'streams', path), `${path}.streams`, readStream),
    tunes: readEach(field(value, 'tunes', path), `${path}.tunes`, readTune),
    people: readEach(field(value, 'people', path), `${path}.people`, readPerson),
  };
}
